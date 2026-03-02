import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Captura erros que normalmente derrubariam o servidor sem deixar rastro
process.on('uncaughtException', (err) => {
    console.error('❌ ERRO CRÍTICO (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ AVISO (Unhandled Rejection):', reason);
});

const { Pool } = pg;

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();

// Pool otimizado para Neon PostgreSQL
// Neon usa connection pooling e suporta SSL com channel_binding
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    max: 10,                    // máximo de conexões simultâneas
    idleTimeoutMillis: 30000,  // fecha conexões ociosas após 30s
    connectionTimeoutMillis: 10000, // timeout para obter conexão
});

// Log de erros do pool para facilitar diagnóstico
pool.on('error', (err) => {
    console.error('[Pool] Erro inesperado na conexão:', err.message);
});

// Rota de saúde para o Railway confirmar que o servidor e o banco estão bem
app.get('/', (req, res) => {
    res.status(200).send('API do Restaurante está Online e Rodando!');
});

app.use(cors({
    origin: ['https://www.utable.shop', 'https://utable.shop', 'https://empreendedorismo-omega.vercel.app', 'http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// --- STRIPE WEBHOOK ---
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    let event;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (endpointSecret) {
        const signature = req.headers['stripe-signature'];
        try {
            event = stripe.webhooks.constructEvent(req.body, signature, endpointSecret);
        } catch (err) {
            console.log(`⚠️  Webhook signature verification failed.`, err.message);
            return res.sendStatus(400);
        }
    } else {
        event = JSON.parse(req.body.toString());
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        if (session.metadata && session.metadata.poolId) {
            const poolId = session.metadata.poolId;
            const amountPaid = session.amount_total / 100;
            const contributorName = session.metadata.contributorName;
            const paymentIntentId = session.payment_intent;

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                // Record the authorized contribution
                await client.query(
                    'INSERT INTO pagamentos_divisoes (id_pagamento, nome_contribuinte, valor, status, stripe_payment_intent_id) VALUES ($1, $2, $3, $4, $5)',
                    [poolId, contributorName, amountPaid, 'AUTORIZADO', paymentIntentId]
                );

                // Check total authorized
                const poolRes = await client.query('SELECT valor_total FROM pagamentos WHERE id_pagamento = $1', [poolId]);
                const poolData = poolRes.rows[0];

                const authRes = await client.query("SELECT SUM(valor) as total FROM pagamentos_divisoes WHERE id_pagamento = $1 AND status = 'AUTORIZADO'", [poolId]);
                const totalAuth = parseFloat(authRes.rows[0].total || 0);

                if (totalAuth >= parseFloat(poolData.valor_total)) {
                    // Capture all intents
                    const intentsToCapture = await client.query("SELECT id_divisao, stripe_payment_intent_id FROM pagamentos_divisoes WHERE id_pagamento = $1 AND status = 'AUTORIZADO'", [poolId]);
                    for (const row of intentsToCapture.rows) {
                        try {
                            await stripe.paymentIntents.capture(row.stripe_payment_intent_id);
                            await client.query("UPDATE pagamentos_divisoes SET status = 'CAPTURADO' WHERE id_divisao = $1", [row.id_divisao]);
                        } catch (e) {
                            console.error('Failed to capture:', row.stripe_payment_intent_id, e);
                        }
                    }
                    await client.query("UPDATE pagamentos SET status = 'CAPTURADO' WHERE id_pagamento = $1", [poolId]);
                }

                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                console.error('Webhook error:', err);
            } finally {
                client.release();
            }
        }
    }

    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;

        // Log transaction splits
        const amount = paymentIntent.amount_received / 100;
        const appFee = paymentIntent.application_fee_amount ? (paymentIntent.application_fee_amount / 100) : 0;
        const transfer = amount - appFee;

        console.log(`[Stripe Webhook] PaymentIntent Succeeded: Total: ${amount} | Fee: ${appFee} | Transfer: ${transfer}`);

        // Ensure payment intent was created via pool (has metadata)
        if (paymentIntent.metadata && paymentIntent.metadata.poolId) {
            const poolId = paymentIntent.metadata.poolId;

            try {
                await pool.query(
                    `UPDATE pagamentos 
                     SET taxa_plataforma = $1, repasse_restaurante = $2, status = 'CAPTURADO' 
                     WHERE id_pagamento = $3`,
                    [appFee, transfer, poolId]
                );
                console.log(`[Stripe Webhook] DB Updated for Pool ${poolId}`);
            } catch (dbError) {
                console.error('[Stripe Webhook] DB Error:', dbError);
            }
        }
    }

    res.json({ received: true });
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const YOUR_DOMAIN = process.env.BASE_URL || 'http://localhost:3000';

// --- AUTH MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).json({ error: 'Autenticação necessária' });

    jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido ou expirado' });
        req.user = user;
        next();
    });
};

const requireRole = (role) => {
    return (req, res, next) => {
        if (!req.user || req.user.role !== role) {
            return res.status(403).json({ error: 'Acesso restrito' });
        }
        next();
    };
};

// --- AUTH CONTEXT ---

// POST /api/auth/register - Register a new user (CLIENTE)
app.post('/api/auth/register', async (req, res) => {
    const { name, email, phone, password } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Check if user already exists
        const userCheck = await client.query('SELECT id_usuario FROM usuarios WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'E-mail já está em uso' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert new user
        const newUserRes = await client.query(
            'INSERT INTO usuarios (nome_completo, email, telefone, senha_hash) VALUES ($1, $2, $3, $4) RETURNING id_usuario, nome_completo, email',
            [name, email, phone, hashedPassword]
        );
        const newUser = newUserRes.rows[0];

        // Get CLIENTE role ID
        const roleRes = await client.query('SELECT id_papel FROM papeis WHERE nome = $1', ['CLIENTE']);
        if (roleRes.rows.length === 0) {
            throw new Error('Papel CLIENTE não encontrado no banco de dados');
        }
        const roleId = roleRes.rows[0].id_papel;

        // Assign CLIENTE role to user
        await client.query(
            'INSERT INTO usuarios_papeis (id_usuario, id_papel) VALUES ($1, $2)',
            [newUser.id_usuario, roleId]
        );

        await client.query('COMMIT');

        // Generate JWT
        const token = jwt.sign(
            { id: newUser.id_usuario, email: newUser.email, role: 'CLIENTE' },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' }
        );

        res.status(201).json({
            token,
            user: {
                id: newUser.id_usuario,
                name: newUser.nome_completo,
                email: newUser.email,
                role: 'CLIENTE'
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in registration:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// POST /api/auth/login - Login user
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Find user
        const userRes = await pool.query(
            `SELECT u.*, p.nome as role 
             FROM usuarios u 
             LEFT JOIN usuarios_papeis up ON u.id_usuario = up.id_usuario
             LEFT JOIN papeis p ON up.id_papel = p.id_papel
             WHERE u.email = $1`,
            [email]
        );

        if (userRes.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const user = userRes.rows[0];

        // Check password
        const validPassword = await bcrypt.compare(password, user.senha_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Check if user is active
        if (!user.ativo) {
            return res.status(403).json({ error: 'Conta desativada' });
        }

        // Generate JWT
        const role = user.role || 'CLIENTE';
        const token = jwt.sign(
            { id: user.id_usuario, email: user.email, role },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id_usuario,
                name: user.nome_completo,
                email: user.email,
                role
            }
        });
    } catch (error) {
        console.error('Error in login:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- MENU CONTEXT ---

// GET /api/restaurants/nearby - Fetch nearby restaurants
app.get('/api/restaurants/nearby', async (req, res) => {
    const { lat, lng, radiusKm = 10 } = req.query;

    if (!lat || !lng) {
        return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    try {
        // Haversine formula directly in SQL
        // Haversine formula using CTE to allow filtering by the calculated 'distance' alias
        const query = `
            WITH restaurant_distances AS (
                SELECT 
                    r.id_restaurante,
                    r.nome_fantasia as name,
                    r.slug,
                    r.logradouro as address,
                    r.latitude,
                    r.longitude,
                    (
                        6371 * acos(
                            cos(radians($1)) * 
                            cos(radians(CAST(r.latitude AS NUMERIC))) * 
                            cos(radians(CAST(r.longitude AS NUMERIC)) - radians($2)) + 
                            sin(radians($1)) * 
                            sin(radians(CAST(r.latitude AS NUMERIC)))
                        )
                    ) AS distance
                FROM restaurantes r
                WHERE r.ativo = true AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
            )
            SELECT * FROM restaurant_distances
            WHERE distance <= $3
            ORDER BY distance ASC;
        `;

        const result = await pool.query(query, [lat, lng, radiusKm]);
        res.json(result.rows.map(row => ({
            ...row,
            distance: parseFloat(row.distance).toFixed(2)
        })));
    } catch (error) {
        console.error('Error fetching nearby restaurants:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/menu - Fetch full menu with relations
app.get('/api/menu', async (req, res) => {
    const { slug } = req.query;

    // 🚀 1. BARREIRA DE SEGURANÇA: Se não mandar o restaurante, barra a requisição!
    if (!slug) {
        return res.status(400).json({ error: 'O slug do restaurante é obrigatório para carregar o cardápio.' });
    }

    try {
        const query = `
            SELECT 
                i.*,
                COALESCE(json_agg(DISTINCT ing.nome) FILTER (WHERE ing.nome IS NOT NULL), '[]') as ingredients,
                COALESCE(json_agg(DISTINCT a.nome) FILTER (WHERE a.nome IS NOT NULL), '[]') as allergens,
                COALESCE(json_agg(DISTINCT jsonb_build_object('name', ad.nome, 'price', ad.preco)) FILTER (WHERE ad.nome IS NOT NULL), '[]') as addons
            FROM cardapio_itens i
            LEFT JOIN cardapio_itens_ingredientes ing ON i.id_item = ing.id_item
            LEFT JOIN cardapio_itens_alergenos cia ON i.id_item = cia.id_item
            LEFT JOIN alergenos a ON cia.id_alergeno = a.id_alergeno
            LEFT JOIN cardapio_itens_adicionais ad ON i.id_item = ad.id_item
            JOIN restaurantes r ON i.id_restaurante = r.id_restaurante
            WHERE i.ativo = true AND r.slug = $1 -- 🚀 2. Filtro estrito: Apenas deste restaurante!
            GROUP BY i.id_item
        `;
        // 🚀 3. O array de variáveis agora sempre tem o slug
        const result = await pool.query(query, [slug]);

        // Map snake_case to frontend camelCase
        const menu = result.rows.map(row => ({
            id: row.id_item,
            name: row.nome,
            description: row.descricao,
            price: parseFloat(row.preco),
            image: row.image_url,
            category: row.categoria,
            ingredients: row.ingredients,
            allergens: row.allergens,
            addons: row.addons.map(a => ({ name: a.name, price: parseFloat(a.price) }))
        }));

        res.json(menu);
    } catch (error) {
        console.error('Error fetching menu:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/menu - Add item
app.post('/api/menu', async (req, res) => {
    const { name, description, price, image, category, ingredients, addons, allergens } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const itemRes = await client.query(
            'INSERT INTO cardapio_itens (id_restaurante, nome, descricao, image_url, preco, categoria) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_item',
            [1, name, description, image, price, category]
        );
        const itemId = itemRes.rows[0].id_item;

        // Add ingredients
        if (ingredients && ingredients.length > 0) {
            for (const ing of ingredients) {
                await client.query('INSERT INTO cardapio_itens_ingredientes (id_item, nome) VALUES ($1, $2)', [itemId, ing]);
            }
        }

        // Add addons
        if (addons && addons.length > 0) {
            for (const ad of addons) {
                await client.query('INSERT INTO cardapio_itens_adicionais (id_item, nome, preco) VALUES ($1, $2, $3)', [itemId, ad.name, ad.price]);
            }
        }

        // Add allergens
        if (allergens && allergens.length > 0) {
            for (const alName of allergens) {
                const alRes = await client.query('SELECT id_alergeno FROM alergenos WHERE nome = $1', [alName]);
                if (alRes.rows.length > 0) {
                    await client.query('INSERT INTO cardapio_itens_alergenos (id_item, id_alergeno) VALUES ($1, $2)', [itemId, alRes.rows[0].id_alergeno]);
                }
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ id: itemId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding item:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// DELETE /api/menu/:id
app.delete('/api/menu/:id', async (req, res) => {
    try {
        await pool.query('UPDATE cardapio_itens SET ativo = false WHERE id_item = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- SESSION & TABLE CONTEXT ---

// POST /api/session/join
app.post('/api/session/join', async (req, res) => {
    const { tableCode, restaurantSlug } = req.body;
    // user ID 1 as placeholder for anonymous clients in this demo, or we could pass user ID if logged in.
    const userId = req.body.userId || 1;

    // 🚀 1. Agora validamos se o Front-end mandou as duas informações
    if (!tableCode || !restaurantSlug) {
        return res.status(400).json({ error: 'Código da mesa e identificação do restaurante são obrigatórios' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 🚀 2. JOIN: Busca a mesa APENAS se ela pertencer ao restaurante com este slug
        const tableRes = await client.query(`
            SELECT m.id_mesa, r.id_restaurante 
            FROM mesas m
            JOIN restaurantes r ON m.id_restaurante = r.id_restaurante
            WHERE UPPER(m.identificador_mesa) = UPPER($1) 
              AND r.slug = $2 
              AND m.ativa = true
        `, [tableCode, restaurantSlug]);

        if (tableRes.rows.length === 0) {
            return res.status(404).json({ error: 'Mesa não encontrada neste restaurante ou inativa' });
        }

        const mesaId = tableRes.rows[0].id_mesa;
        // 🚀 3. Pegamos o ID real do restaurante do banco de dados
        const restauranteId = tableRes.rows[0].id_restaurante;

        // Check if there's an active session for this table
        let sessionRes = await client.query("SELECT id_sessao FROM sessoes WHERE id_mesa = $1 AND status = 'ABERTA' LIMIT 1", [mesaId]);

        let sessionId;
        if (sessionRes.rows.length === 0) {
            // Create a new session
            // 🚀 4. Substituímos o [1, mesaId...] fixo pelo [restauranteId, mesaId...]
            const newSession = await client.query(
                "INSERT INTO sessoes (id_restaurante, id_mesa, id_usuario_criador, status) VALUES ($1, $2, $3, 'ABERTA') RETURNING id_sessao",
                [restauranteId, mesaId, userId]
            );
            sessionId = newSession.rows[0].id_sessao;
        } else {
            sessionId = sessionRes.rows[0].id_sessao;
        }

        await client.query('COMMIT');
        res.json({ sessionId, tableId: mesaId, tableCode });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error joining session:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// GET /api/user/:userId/history - Fetch session history for a specific user
app.get('/api/user/:userId/history', async (req, res) => {
    const { userId } = req.params;
    try {
        const query = `
            SELECT DISTINCT
                s.id_sessao as id,
                s.criado_em as date,
                m.identificador_mesa as table,
                s.status,
                (
                    SELECT COALESCE(SUM(pd.valor), 0)
                    FROM pagamentos p
                    JOIN pagamentos_divisoes pd ON p.id_pagamento = pd.id_pagamento
                    WHERE p.id_sessao = s.id_sessao AND pd.id_usuario_pagador = $1 AND pd.status = 'CAPTURADO'
                ) as user_paid,
                (
                    SELECT COALESCE(SUM(pi.final_price * pi.quantidade), 0)
                    FROM pedidos ped
                    JOIN pedidos_itens pi ON ped.id_pedido = pi.id_pedido
                    WHERE ped.id_sessao = s.id_sessao AND ped.status != 'Cancelado'
                ) as session_total
            FROM sessoes s
            JOIN mesas m ON s.id_mesa = m.id_mesa
            LEFT JOIN pagamentos p ON s.id_sessao = p.id_sessao
            LEFT JOIN pagamentos_divisoes pd ON p.id_pagamento = pd.id_pagamento
            WHERE s.id_usuario_criador = $1 OR pd.id_usuario_pagador = $1
            ORDER BY s.criado_em DESC
        `;
        const result = await pool.query(query, [userId]);
        res.json(result.rows);
    } catch (e) {
        console.error('Error fetching user history:', e);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/session/:sessionId/details - Fetch full details of a past session
app.get('/api/session/:sessionId/details', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const sessionRes = await pool.query(
            `SELECT s.*, m.identificador_mesa 
             FROM sessoes s 
             JOIN mesas m ON s.id_mesa = m.id_mesa 
             WHERE s.id_sessao = $1`,
            [sessionId]
        );

        if (sessionRes.rows.length === 0) {
            return res.status(404).json({ error: 'Sessão não encontrada' });
        }

        const ordersRes = await pool.query(
            `SELECT p.id_pedido, p.status as order_status, pi.id_pedido_item, ci.nome, pi.quantidade, pi.final_price, pi.observacoes
             FROM pedidos p
             JOIN pedidos_itens pi ON p.id_pedido = pi.id_pedido
             JOIN cardapio_itens ci ON pi.id_item = ci.id_item
             WHERE p.id_sessao = $1 AND p.status != 'Cancelado'`,
            [sessionId]
        );

        const paymentsRes = await pool.query(
            `SELECT pd.nome_contribuinte, pd.valor, pd.status, pd.criado_em, u.nome_completo as user_name
             FROM pagamentos p
             JOIN pagamentos_divisoes pd ON p.id_pagamento = pd.id_pagamento
             LEFT JOIN usuarios u ON pd.id_usuario_pagador = u.id_usuario
             WHERE p.id_sessao = $1 AND pd.status = 'CAPTURADO'`,
            [sessionId]
        );

        res.json({
            session: sessionRes.rows[0],
            orders: ordersRes.rows,
            payments: paymentsRes.rows
        });
    } catch (e) {
        console.error('Error fetching session details:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- ORDER CONTEXT ---

// POST /api/orders - Add to order
app.post('/api/orders', async (req, res) => {
    const { item, selectedAddons, observations, sessionId } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'Sessão da mesa é obrigatória para fazer pedidos' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Check if session is valid and OPEN
        const sessionCheck = await client.query("SELECT status FROM sessoes WHERE id_sessao = $1", [sessionId]);
        if (sessionCheck.rows.length === 0 || sessionCheck.rows[0].status !== 'ABERTA') {
            throw new Error("Sessão inválida ou fechada");
        }

        // 2. Create Order
        const orderRes = await client.query(
            'INSERT INTO pedidos (id_sessao, status) VALUES ($1, $2) RETURNING id_pedido',
            [sessionId, 'Recebido']
        );
        const orderId = orderRes.rows[0].id_pedido;

        // 🚀 PROTEÇÃO 1: Garante que os adicionais sejam um array, mesmo se vier vazio
        const safeAddons = selectedAddons || [];

        // 🚀 PROTEÇÃO 2: Converte os valores forçadamente para número (Float) para evitar soma de strings
        const addonsPrice = safeAddons.reduce((acc, curr) => acc + parseFloat(curr.price || 0), 0);
        const itemPrice = parseFloat(item.price || 0);
        const finalPrice = itemPrice + addonsPrice;

        // 3. Create Order Item
        const orderItemRes = await client.query(
            'INSERT INTO pedidos_itens (id_pedido, id_item, quantidade, valor_unitario_base, final_price, observacoes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_pedido_item',
            [orderId, item.id, 1, itemPrice, finalPrice, observations || null]
        );
        const orderItemId = orderItemRes.rows[0].id_pedido_item;

        // 4. Create Order Item Addons
        if (safeAddons.length > 0) {
            for (const ad of safeAddons) {
                // Find specific addon ID from DB
                const adRes = await client.query('SELECT id_item_adicional FROM cardapio_itens_adicionais WHERE id_item = $1 AND nome = $2', [item.id, ad.name]);
                if (adRes.rows.length > 0) {
                    await client.query(
                        'INSERT INTO pedidos_itens_adicionais (id_pedido_item, id_item_adicional, nome_snapshot, preco_snapshot) VALUES ($1, $2, $3, $4)',
                        [orderItemId, adRes.rows[0].id_item_adicional, ad.name, parseFloat(ad.price || 0)]
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ orderId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in order:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// GET /api/orders/:sessionId - Fetch all orders with details for a specific session
app.get('/api/orders/:sessionId', async (req, res) => {
    try {
        const query = `
            SELECT 
                p.id_pedido as id,
                p.status,
                p.criado_em as timestamp,
                pi.id_pedido_item as "orderItemId",
                pi.quantidade as quantity,
                pi.valor_unitario_base as price,
                pi.final_price as "finalPrice",
                pi.observacoes as observations,
                ci.nome as name,
                ci.image_url as image,
                COALESCE(json_agg(jsonb_build_object('name', pia.nome_snapshot, 'price', pia.preco_snapshot)) FILTER (WHERE pia.nome_snapshot IS NOT NULL), '[]') as "selectedAddons"
            FROM pedidos p
            JOIN pedidos_itens pi ON p.id_pedido = pi.id_pedido
            JOIN cardapio_itens ci ON pi.id_item = ci.id_item
            LEFT JOIN pedidos_itens_adicionais pia ON pi.id_pedido_item = pia.id_pedido_item
            WHERE p.id_sessao = $1
            -- 🚀 CORREÇÃO: Listando todas as colunas não-agregadas para evitar Erro 500 do PostgreSQL
            GROUP BY 
                p.id_pedido, 
                p.status, 
                p.criado_em,
                pi.id_pedido_item, 
                pi.quantidade, 
                pi.valor_unitario_base, 
                pi.final_price, 
                pi.observacoes,
                ci.id_item, 
                ci.nome, 
                ci.image_url
            ORDER BY p.criado_em DESC
        `;
        const result = await pool.query(query, [req.params.sessionId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: error.message });
    }
});

// PATCH /api/orders/:id/status
app.patch('/api/orders/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
        let query = 'UPDATE pedidos SET status = $1';
        const params = [status, req.params.id];

        if (status === 'Preparando') {
            query += ', em_preparo_em = CURRENT_TIMESTAMP';
        } else if (status === 'Pronto') {
            query += ', pronto_em = CURRENT_TIMESTAMP';
        } else if (status === 'Entregue') {
            query += ', entregue_em = CURRENT_TIMESTAMP';
        }

        query += ' WHERE id_pedido = $2';

        await pool.query(query, params);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ADMIN METRICS ---

app.get('/api/admin/metrics', async (req, res) => {
    const { period } = req.query; // '1d', '1w', '1m', '3m', '6m', '1y'

    let interval = "INTERVAL '1 month'";
    if (period === '1d') interval = "INTERVAL '1 day'";
    if (period === '1w') interval = "INTERVAL '1 week'";
    if (period === '3m') interval = "INTERVAL '3 months'";
    if (period === '6m') interval = "INTERVAL '6 months'";
    if (period === '1y') interval = "INTERVAL '1 year'";

    try {
        const client = await pool.connect();
        try {
            // 1. Financeiro: Receita e Pedidos
            const financialRes = await client.query(`
                SELECT 
                    COALESCE(SUM(valor_total), 0) as revenue,
                    COUNT(*) as total_orders
                FROM pagamentos 
                WHERE status = 'CAPTURADO' AND criado_em >= NOW() - ${interval}
            `);

            // 2. Mesas: Totais, Vazias e Ocupadas
            const tablesRes = await client.query(`
                SELECT 
                    (SELECT COUNT(*) FROM mesas WHERE ativa = true) as total_tables,
                    (SELECT COUNT(DISTINCT id_mesa) FROM sessoes WHERE status = 'ABERTA') as occupied_tables
            `);

            // 3. Performance: Tempo Médio
            const performanceRes = await client.query(`
                SELECT 
                    AVG(EXTRACT(EPOCH FROM (pronto_em - em_preparo_em))/60) as avg_production_time,
                    AVG(EXTRACT(EPOCH FROM (entregue_em - pronto_em))/60) as avg_delivery_time
                FROM pedidos
                WHERE status = 'Entregue' 
                AND em_preparo_em IS NOT NULL 
                AND pronto_em IS NOT NULL 
                AND entregue_em IS NOT NULL
                AND criado_em >= NOW() - ${interval}
            `);

            // 4. Horários de Pico (Agrupado por hora)
            const peakHoursRes = await client.query(`
                SELECT 
                    EXTRACT(HOUR FROM criado_em) as hour,
                    COUNT(*) as count
                FROM pedidos
                WHERE status != 'Cancelado' AND criado_em >= NOW() - ${interval}
                GROUP BY hour
                ORDER BY hour
            `);

            // 5. Abandono: Mesas abertas mas fechadas sem pedidos
            // (Sessões fechadas que não possuem nenhum pedido associado)
            const abandonmentRes = await client.query(`
                SELECT COUNT(*) as abandoned_sessions
                FROM sessoes s
                WHERE s.status = 'FECHADA' 
                AND s.criado_em >= NOW() - ${interval}
                AND NOT EXISTS (SELECT 1 FROM pedidos p WHERE p.id_sessao = s.id_sessao)
            `);

            // 6. Evolução Diária (Para gráfico de receita)
            const dailyRevenueRes = await client.query(`
                SELECT 
                    TO_CHAR(criado_em, 'DD/MM') as date,
                    SUM(valor_total) as value
                FROM pagamentos
                WHERE status = 'CAPTURADO' AND criado_em >= NOW() - ${interval}
                GROUP BY date, DATE_TRUNC('day', criado_em)
                ORDER BY DATE_TRUNC('day', criado_em)
            `);

            const metrics = {
                revenue: parseFloat(financialRes.rows[0].revenue),
                totalOrders: parseInt(financialRes.rows[0].total_orders),
                tables: {
                    total: parseInt(tablesRes.rows[0].total_tables),
                    occupied: parseInt(tablesRes.rows[0].occupied_tables),
                    empty: Math.max(0, parseInt(tablesRes.rows[0].total_tables) - parseInt(tablesRes.rows[0].occupied_tables))
                },
                performance: {
                    avgProduction: parseFloat(performanceRes.rows[0].avg_production_time || 0).toFixed(1),
                    avgDelivery: parseFloat(performanceRes.rows[0].avg_delivery_time || 0).toFixed(1)
                },
                peakHours: peakHoursRes.rows.map(r => ({ hour: `${parseInt(r.hour)}h`, count: parseInt(r.count) })),
                abandonment: parseInt(abandonmentRes.rows[0].abandoned_sessions),
                revenueEvolution: dailyRevenueRes.rows
            };

            res.json(metrics);
        } finally {
            client.release();
        }
    } catch (e) {
        console.error('Error fetching metrics:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- KITCHEN GLOBAL SYNC ---

// GET /api/admin/kitchen/orders — Busca TODOS os pedidos ativos de todas as sessões
app.get('/api/admin/kitchen/orders', async (req, res) => {
    try {
        const query = `
            SELECT 
                pi.id_pedido_item as id,
                p.id_pedido as "orderId",
                p.status,
                p.criado_em as timestamp,
                pi.quantidade as quantity,
                pi.final_price as "valor_total",
                pi.observacoes as observations,
                ci.nome as name,
                m.identificador_mesa as "tableIdentifier",
                s.id_mesa as "tableId",
                COALESCE(json_agg(jsonb_build_object('name', pia.nome_snapshot, 'price', pia.preco_snapshot)) FILTER (WHERE pia.nome_snapshot IS NOT NULL), '[]') as "selectedAddons"
            FROM pedidos p
            JOIN pedidos_itens pi ON p.id_pedido = pi.id_pedido
            JOIN cardapio_itens ci ON pi.id_item = ci.id_item
            JOIN sessoes s ON p.id_sessao = s.id_sessao
            JOIN mesas m ON s.id_mesa = m.id_mesa
            LEFT JOIN pedidos_itens_adicionais pia ON pi.id_pedido_item = pia.id_pedido_item
            WHERE p.status IN ('Recebido', 'Preparando', 'Pronto')
            GROUP BY p.id_pedido, pi.id_pedido_item, ci.id_item, m.id_mesa, s.id_mesa
            ORDER BY p.criado_em ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (e) {
        console.error('Error in kitchen orders:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- STRIPE CONNECT ONBOARDING ---

app.get('/api/admin/stripe/status', authenticateToken, requireRole('ADMIN'), async (req, res) => {
    try {
        // Assume restaurante ID 1 (default from scope)
        const restResult = await pool.query('SELECT stripe_account_id FROM restaurantes WHERE id_restaurante = 1');

        if (restResult.rows.length === 0) {
            return res.status(404).json({ error: 'Restaurant not found' });
        }

        const stripeAccountId = restResult.rows[0].stripe_account_id;

        if (!stripeAccountId) {
            return res.json({ connected: false });
        }

        // Optional: Check with Stripe API if account is fully onboarded
        try {
            const account = await stripe.accounts.retrieve(stripeAccountId);
            res.json({
                connected: true,
                details_submitted: account.details_submitted,
                charges_enabled: account.charges_enabled
            });
        } catch (stripeErr) {
            // Account might be deleted on Stripe but still in DB
            res.json({ connected: false, error: 'Stripe account invalid' });
        }

    } catch (err) {
        console.error('Error fetching Stripe status:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/stripe/onboard', authenticateToken, requireRole('ADMIN'), async (req, res) => {
    try {
        let stripeAccountId;

        const restResult = await pool.query('SELECT stripe_account_id FROM restaurantes WHERE id_restaurante = 1');

        if (restResult.rows[0]?.stripe_account_id) {
            stripeAccountId = restResult.rows[0].stripe_account_id;
        } else {
            // Create Express Account
            const account = await stripe.accounts.create({
                type: 'express',
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
            });
            stripeAccountId = account.id;

            await pool.query('UPDATE restaurantes SET stripe_account_id = $1 WHERE id_restaurante = 1', [stripeAccountId]);
        }

        // Generate AccountLink for Onboarding
        const accountLink = await stripe.accountLinks.create({
            account: stripeAccountId,
            refresh_url: `${YOUR_DOMAIN}/admin`, // Route user back if they abandon
            return_url: `${YOUR_DOMAIN}/admin`,  // Success return
            type: 'account_onboarding',
        });

        res.json({ url: accountLink.url });
    } catch (e) {
        console.error('Stripe Onboarding Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- STRIPE (Preserved but integrated with item price) ---

app.post('/create-checkout-session', async (req, res) => {
    try {
        const { items, tip, appTax, sessionId, userId, total, restaurantSlug, tableId } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Nenhum item no pedido' });
        }

        const line_items = items.map(item => ({
            price_data: {
                currency: 'brl',
                product_data: {
                    name: item.name,
                },
                unit_amount: Math.round(item.price * 100),
            },
            quantity: item.quantity,
        }));

        if (tip > 0) {
            line_items.push({
                price_data: {
                    currency: 'brl',
                    product_data: { name: 'Gorjeta Garçom' },
                    unit_amount: Math.round(tip * 100),
                },
                quantity: 1,
            });
        }

        if (appTax > 0) {
            line_items.push({
                price_data: {
                    currency: 'brl',
                    product_data: { name: 'Taxa do App (3%)' },
                    unit_amount: Math.round(appTax * 100),
                },
                quantity: 1,
            });
        }

        // Build success URL with params for confirmation
        const totalAmount = total || items.reduce((acc, i) => acc + i.price * i.quantity, 0) + (tip || 0) + (appTax || 0);
        let successUrl = `${YOUR_DOMAIN}/success?type=direct&amount=${totalAmount.toFixed(2)}`;
        if (sessionId) successUrl += `&session_id=${sessionId}`;
        if (userId) successUrl += `&user_id=${userId}`;
        if (restaurantSlug) successUrl += `&slug=${restaurantSlug}`;
        if (tableId) successUrl += `&table=${tableId}`;

        // Feature: Stripe Connect Split
        let paymentIntentData = {};

        // Fetch restaurant's Stripe Account ID if sessionId is provided
        if (sessionId) {
            const restQuery = await pool.query(`
                SELECT r.stripe_account_id 
                FROM restaurantes r
                JOIN sessoes s ON s.id_restaurante = r.id_restaurante
                WHERE s.id_sessao = $1
            `, [sessionId]);

            if (restQuery.rows.length > 0 && restQuery.rows[0].stripe_account_id) {
                const acctId = restQuery.rows[0].stripe_account_id;

                // Ensure platform gets exactly 3%
                const feeAmount = Math.round(totalAmount * 0.03 * 100);

                paymentIntentData = {
                    application_fee_amount: feeAmount,
                    transfer_data: {
                        destination: acctId
                    }
                };
            }
        }

        const sessionPayload = {
            line_items,
            mode: 'payment',
            success_url: successUrl,
            cancel_url: `${YOUR_DOMAIN}/bill?canceled=true`,
        };

        if (Object.keys(paymentIntentData).length > 0) {
            sessionPayload.payment_intent_data = paymentIntentData;
        }

        const session = await stripe.checkout.sessions.create(sessionPayload);

        res.json({ url: session.url });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/payment/direct/confirm — Confirma pagamento direto (Pagar Integral)
// Registra o pagamento no BD sem fechar a sessão
app.post('/api/payment/direct/confirm', async (req, res) => {
    const { sessionId, userId, amount } = req.body;

    if (!sessionId || !amount) {
        return res.status(400).json({ error: 'sessionId e amount são obrigatórios' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verificar se a sessão está aberta
        const sessionCheck = await client.query(
            "SELECT id_sessao FROM sessoes WHERE id_sessao = $1 AND status = 'ABERTA'",
            [sessionId]
        );
        if (sessionCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Sessão inválida ou fechada' });
        }

        // Verificar se já existe um pagamento direto para essa sessão (evitar duplicatas)
        const existingCheck = await client.query(
            "SELECT id_pagamento FROM pagamentos WHERE id_sessao = $1 AND metodo = 'STRIPE_DIRETO' AND status = 'CAPTURADO' AND criado_em > NOW() - INTERVAL '2 minutes'",
            [sessionId]
        );
        if (existingCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.json({ success: true, duplicate: true });
        }

        // Criar registro do pagamento
        const payRes = await client.query(
            "INSERT INTO pagamentos (id_sessao, valor_total, status, metodo) VALUES ($1, $2, 'CAPTURADO', 'STRIPE_DIRETO') RETURNING id_pagamento",
            [sessionId, amount]
        );
        const paymentId = payRes.rows[0].id_pagamento;

        // Registrar a divisão (100% do pagador)
        await client.query(
            "INSERT INTO pagamentos_divisoes (id_pagamento, nome_contribuinte, valor, status, id_usuario_pagador) VALUES ($1, $2, $3, 'PAGO', $4)",
            [paymentId, 'Pagamento Integral', amount, userId ? parseInt(userId) : null]
        );

        // Vincular TODOS os itens ativos da sessão ao pagamento
        // Isso faz com que sejam filtrados em Bill.jsx como "pagos"
        const activeItemsRes = await client.query(
            `SELECT pi.id_pedido_item
             FROM pedidos p
             JOIN pedidos_itens pi ON p.id_pedido = pi.id_pedido
             WHERE p.id_sessao = $1 AND p.status != 'Cancelado'`,
            [sessionId]
        );
        for (const item of activeItemsRes.rows) {
            await client.query(
                'INSERT INTO pool_itens (id_pagamento, id_pedido_item) VALUES ($1, $2) ON CONFLICT (id_pedido_item) DO NOTHING',
                [paymentId, item.id_pedido_item]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error confirming direct payment:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// --- STRIPE POOL (Divisão) ---

// GET /api/pool/:id
app.get('/api/pool/:id', async (req, res) => {
    try {
        const poolId = req.params.id;
        const poolRes = await pool.query('SELECT * FROM pagamentos WHERE id_pagamento = $1', [poolId]);
        if (poolRes.rows.length === 0) return res.status(404).json({ error: 'Pool not found' });

        const contributionsRes = await pool.query('SELECT nome_contribuinte, valor, status, criado_em FROM pagamentos_divisoes WHERE id_pagamento = $1 ORDER BY criado_em DESC', [poolId]);
        const poolData = poolRes.rows[0];
        const contributions = contributionsRes.rows.map(c => ({
            contributorName: c.nome_contribuinte,
            amount: parseFloat(c.valor),
            status: c.status,
            timestamp: c.criado_em
        }));

        const initialPaid = contributions.reduce((acc, c) => acc + c.amount, 0);
        res.json({
            id: poolData.id_pagamento,
            totalAmount: parseFloat(poolData.valor_total),
            initialPaid,
            remainingAmount: Math.max(0, parseFloat(poolData.valor_total) - initialPaid),
            contributions,
            isPaid: poolData.status === 'CAPTURADO'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/pool/session/:sessionId -> Busca pool PENDENTE ativa para uma sessão (mesa)
app.get('/api/pool/session/:sessionId', async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        // Busca apenas a pool PENDENTE mais recente (não mistura com CAPTURADO)
        const poolRes = await pool.query(
            "SELECT * FROM pagamentos WHERE id_sessao = $1 AND status = 'PENDENTE' ORDER BY criado_em DESC LIMIT 1",
            [sessionId]
        );
        if (poolRes.rows.length === 0) return res.status(200).json({ pool: null });

        const poolData = poolRes.rows[0];
        const poolId = poolData.id_pagamento;

        const contributionsRes = await pool.query(
            'SELECT nome_contribuinte, valor, status, criado_em FROM pagamentos_divisoes WHERE id_pagamento = $1 ORDER BY criado_em DESC',
            [poolId]
        );
        const contributions = contributionsRes.rows.map(c => ({
            contributorName: c.nome_contribuinte,
            amount: parseFloat(c.valor),
            status: c.status,
            timestamp: c.criado_em
        }));

        // Buscar itens vinculados a esta pool
        const itemsRes = await pool.query(
            `SELECT pi2.id_pedido_item as "orderItemId", ci.nome as name, pi2.final_price as "finalPrice", pi2.quantidade as quantity
             FROM pool_itens pli
             JOIN pedidos_itens pi2 ON pli.id_pedido_item = pi2.id_pedido_item
             JOIN cardapio_itens ci ON pi2.id_item = ci.id_item
             WHERE pli.id_pagamento = $1`,
            [poolId]
        );

        const paid = contributions.filter(c => ['PAGO', 'AUTORIZADO', 'CAPTURADO'].includes(c.status)).reduce((acc, c) => acc + c.amount, 0);
        res.json({
            pool: {
                id: poolId,
                totalAmount: parseFloat(poolData.valor_total),
                paid,
                remainingAmount: Math.max(0, parseFloat(poolData.valor_total) - paid),
                contributions,
                items: itemsRes.rows,
                isPaid: poolData.status === 'CAPTURADO',
                status: poolData.status
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/pool/session/:sessionId/all -> Lista TODAS as pools da sessão (abertas + fechadas)
app.get('/api/pool/session/:sessionId/all', async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        const poolsRes = await pool.query(
            "SELECT * FROM pagamentos WHERE id_sessao = $1 ORDER BY criado_em DESC",
            [sessionId]
        );

        const pools = await Promise.all(poolsRes.rows.map(async (poolData) => {
            const poolId = poolData.id_pagamento;

            const contributionsRes = await pool.query(
                'SELECT nome_contribuinte, valor, status, criado_em FROM pagamentos_divisoes WHERE id_pagamento = $1 ORDER BY criado_em DESC',
                [poolId]
            );
            const contributions = contributionsRes.rows.map(c => ({
                contributorName: c.nome_contribuinte,
                amount: parseFloat(c.valor),
                status: c.status,
                timestamp: c.criado_em
            }));

            const itemsRes = await pool.query(
                `SELECT pi2.id_pedido_item as "orderItemId", ci.nome as name, pi2.final_price as "finalPrice", pi2.quantidade as quantity
                 FROM pool_itens pli
                 JOIN pedidos_itens pi2 ON pli.id_pedido_item = pi2.id_pedido_item
                 JOIN cardapio_itens ci ON pi2.id_item = ci.id_item
                 WHERE pli.id_pagamento = $1`,
                [poolId]
            );

            const paid = contributions.filter(c => ['PAGO', 'AUTORIZADO', 'CAPTURADO'].includes(c.status)).reduce((acc, c) => acc + c.amount, 0);
            return {
                id: poolId,
                totalAmount: parseFloat(poolData.valor_total),
                paid,
                remainingAmount: Math.max(0, parseFloat(poolData.valor_total) - paid),
                contributions,
                items: itemsRes.rows,
                isPaid: poolData.status === 'CAPTURADO',
                status: poolData.status,
                criado_em: poolData.criado_em
            };
        }));

        res.json({ pools });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/pool/create
// Aceita orderItemIds opcional para vincular itens à pool via pool_itens
// Se já existir pool PENDENTE para a sessão, retorna ela (não duplica)
app.post('/api/pool/create', async (req, res) => {
    const { totalAmount, baseAmount, sessionId, orderItemIds } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'Sessão da mesa é obrigatória' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verificar se sessão está aberta
        const sessionRes = await client.query(
            "SELECT id_sessao FROM sessoes WHERE id_sessao = $1 AND status = 'ABERTA'",
            [sessionId]
        );
        if (sessionRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Sessão inválida ou fechada' });
        }

        // Verificar se já existe pool PENDENTE para esta sessão
        const existingPoolRes = await client.query(
            "SELECT id_pagamento, valor_total FROM pagamentos WHERE id_sessao = $1 AND status = 'PENDENTE' ORDER BY criado_em DESC LIMIT 1",
            [sessionId]
        );

        let poolId, finalTotalAmount;

        if (existingPoolRes.rows.length > 0) {
            // Retornar pool existente sem criar nova
            poolId = existingPoolRes.rows[0].id_pagamento;
            finalTotalAmount = parseFloat(existingPoolRes.rows[0].valor_total);
            console.log(`[Pool] Retornando pool existente ID ${poolId} para sessão ${sessionId}`);
        } else {
            // Calcular total a partir dos itens se orderItemIds for fornecido
            let computedTotal = totalAmount;
            if (orderItemIds && orderItemIds.length > 0) {
                const itemsRes = await client.query(
                    'SELECT COALESCE(SUM(final_price * quantidade), 0) as total FROM pedidos_itens WHERE id_pedido_item = ANY($1)',
                    [orderItemIds]
                );
                computedTotal = parseFloat(itemsRes.rows[0].total) || totalAmount;
            }
            finalTotalAmount = computedTotal;

            // Criar nova pool
            const newPoolRes = await client.query(
                "INSERT INTO pagamentos (id_sessao, valor_total, status, metodo) VALUES ($1, $2, 'PENDENTE', 'STRIPE') RETURNING id_pagamento",
                [sessionId, finalTotalAmount]
            );
            poolId = newPoolRes.rows[0].id_pagamento;
            console.log(`[Pool] Nova pool ID ${poolId} criada para sessão ${sessionId}`);
        }

        // Vincular itens à pool (ignorar conflitos de UNIQUE — item já vinculado fica na pool que estava)
        if (orderItemIds && orderItemIds.length > 0) {
            for (const itemId of orderItemIds) {
                await client.query(
                    'INSERT INTO pool_itens (id_pagamento, id_pedido_item) VALUES ($1, $2) ON CONFLICT (id_pedido_item) DO NOTHING',
                    [poolId, itemId]
                );
            }
            // Recalcular valor_total da pool com base nos itens agora vinculados
            const totalRes = await client.query(
                `SELECT COALESCE(SUM(pi2.final_price * pi2.quantidade), 0) as total
                 FROM pool_itens pli
                 JOIN pedidos_itens pi2 ON pli.id_pedido_item = pi2.id_pedido_item
                 WHERE pli.id_pagamento = $1`,
                [poolId]
            );
            finalTotalAmount = parseFloat(totalRes.rows[0].total) || finalTotalAmount;
            await client.query('UPDATE pagamentos SET valor_total = $1 WHERE id_pagamento = $2', [finalTotalAmount, poolId]);
        }

        await client.query('COMMIT');
        res.json({ pool: { id: poolId, totalAmount: finalTotalAmount, remainingAmount: finalTotalAmount } });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error creating pool:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// DELETE /api/pool/:poolId/item/:orderItemId — Remove item de pool PENDENTE
// Recalcula o valor_total da pool após remoção
app.delete('/api/pool/:poolId/item/:orderItemId', async (req, res) => {
    const { poolId, orderItemId } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verificar se a pool está PENDENTE
        const poolCheck = await client.query(
            "SELECT status, valor_total FROM pagamentos WHERE id_pagamento = $1",
            [poolId]
        );
        if (poolCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Pool não encontrada' });
        }
        if (poolCheck.rows[0].status !== 'PENDENTE') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Só é possível remover itens de pools com status PENDENTE' });
        }

        // Remover vínculo
        const deleteRes = await client.query(
            'DELETE FROM pool_itens WHERE id_pagamento = $1 AND id_pedido_item = $2 RETURNING id_pool_item',
            [poolId, orderItemId]
        );
        if (deleteRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Item não está vinculado a esta pool' });
        }

        // Recalcular valor_total da pool
        const totalRes = await client.query(
            `SELECT COALESCE(SUM(pi2.final_price * pi2.quantidade), 0) as total
             FROM pool_itens pli
             JOIN pedidos_itens pi2 ON pli.id_pedido_item = pi2.id_pedido_item
             WHERE pli.id_pagamento = $1`,
            [poolId]
        );
        const newTotal = parseFloat(totalRes.rows[0].total);
        await client.query('UPDATE pagamentos SET valor_total = $1 WHERE id_pagamento = $2', [newTotal, poolId]);

        await client.query('COMMIT');
        res.json({ success: true, newTotal });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error removing item from pool:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// POST /api/pool/checkout
app.post('/api/pool/checkout', async (req, res) => {
    try {
        const { poolId, amount, contributorName, itemName, userId, type, restaurantSlug, tableId } = req.body;

        const sessionPayload = {
            line_items: [{
                price_data: {
                    currency: 'brl',
                    product_data: { name: itemName },
                    unit_amount: Math.round(amount * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            // IMPORTANT: Holds the funds instead of automatic capture
            payment_intent_data: {
                //capture_method: 'manual',
                metadata: {
                    poolId: poolId.toString(),
                    contributorName,
                    userId: userId ? userId.toString() : ''
                }
            },
            success_url: `${YOUR_DOMAIN}/success?pool_id=${poolId}&amount=${amount}&name=${encodeURIComponent(contributorName)}${userId ? `&user_id=${userId}` : ''}${type ? `&type=${type}` : ''}${restaurantSlug ? `&slug=${restaurantSlug}` : ''}${tableId ? `&table=${tableId}` : ''}`,
            cancel_url: `${YOUR_DOMAIN}/pool/${poolId}?canceled=true`,
        };

        // Inject Destination Charges (Split) if pool matches a connected restaurant
        const restQuery = await pool.query(`
            SELECT r.stripe_account_id 
            FROM restaurantes r
            JOIN sessoes s ON s.id_restaurante = r.id_restaurante
            JOIN pagamentos p ON p.id_sessao = s.id_sessao
            WHERE p.id_pagamento = $1
        `, [poolId]);

        if (restQuery.rows.length > 0 && restQuery.rows[0].stripe_account_id) {
            const acctId = restQuery.rows[0].stripe_account_id;
            const feeAmount = Math.round(amount * 0.03 * 100);

            sessionPayload.payment_intent_data.application_fee_amount = feeAmount;
            sessionPayload.payment_intent_data.transfer_data = {
                destination: acctId
            };
        }

        const session = await stripe.checkout.sessions.create(sessionPayload);

        res.json({ url: session.url });
    } catch (e) {
        console.error('Error pool checkout:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/pool/confirm - Chamado pelo Success.jsx frontend apos pagamento
app.post('/api/pool/confirm', async (req, res) => {
    const { poolId, amount, contributorName, userId } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Evita duplicacoes checando se ja existe aquele pagamento praquele nome com mesmo valor nas ultimas horas
        // Num cenário real seria o Webhook do Stripe checando o ID do Intent
        await client.query(
            "INSERT INTO pagamentos_divisoes (id_pagamento, nome_contribuinte, valor, status, id_usuario_pagador) VALUES ($1, $2, $3, 'PAGO', $4)",
            [poolId, contributorName, amount, userId || null]
        );

        // Checar se completou e precisa alterar a Pool para CAPTURADO
        const poolRes = await client.query('SELECT valor_total FROM pagamentos WHERE id_pagamento = $1', [poolId]);
        const sumRes = await client.query('SELECT SUM(valor) as total_pago FROM pagamentos_divisoes WHERE id_pagamento = $1', [poolId]);

        if (poolRes.rows.length > 0 && sumRes.rows.length > 0) {
            const totalAguardado = parseFloat(poolRes.rows[0].valor_total);
            const totalPago = parseFloat(sumRes.rows[0].total_pago);
            if (totalPago >= totalAguardado) {
                await client.query("UPDATE pagamentos SET status = 'CAPTURADO' WHERE id_pagamento = $1", [poolId]);
            }
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error confirming pool payment:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// --- WAITER PORTAL ---

// GET /api/waiter/tables - Listagem geral de status para o Dashboard do Garcom
app.get('/api/waiter/tables', async (req, res) => {
    try {
        const query = `
            SELECT m.id_mesa as mesa_id, m.identificador_mesa as identificador, m.capacidade, m.chamar_garcom,
                   s.id_sessao as sessao_id, s.status,
                   COUNT(p.id_pedido) as total_pedidos,
                   COALESCE(SUM(pi.final_price * pi.quantidade), 0) as total_conta
            FROM mesas m
            LEFT JOIN sessoes s ON m.id_mesa = s.id_mesa AND s.status = 'ABERTA'
            LEFT JOIN pedidos p ON s.id_sessao = p.id_sessao
            LEFT JOIN pedidos_itens pi ON p.id_pedido = pi.id_pedido
            WHERE m.ativa = true
            GROUP BY m.id_mesa, s.id_sessao, s.status
            ORDER BY m.identificador_mesa ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/waiter/tables/:tableId - Detalhes e extrato da conta daquela mesa
app.get('/api/waiter/tables/:tableId', async (req, res) => {
    try {
        const { tableId } = req.params;

        // Dados basiocs da mesa e da sessao aberta
        const sessionRes = await pool.query(
            "SELECT id_sessao, status FROM sessoes WHERE id_mesa = $1 AND status = 'ABERTA' LIMIT 1",
            [tableId]
        );

        const basicRes = await pool.query("SELECT identificador_mesa, chamar_garcom FROM mesas WHERE id_mesa = $1", [tableId]);
        if (basicRes.rows.length === 0) return res.status(404).json({ error: 'Mesa not found' });

        const { identificador_mesa: identificador, chamar_garcom } = basicRes.rows[0];

        if (sessionRes.rows.length === 0) {
            return res.json({ identificador, chamar_garcom, status: 'LIVRE', pedidos: [], total_pendente: 0 });
        }

        const sessionId = sessionRes.rows[0].id_sessao;

        // Buscar pedidos (incluindo se já estão pagos)
        const ordersQuery = `
            SELECT pi.id_pedido_item, pi.quantidade, pi.final_price as valor_total, p.status, ci.nome as nome_item,
                   EXISTS (
                       SELECT 1 FROM pool_itens pli
                       JOIN pagamentos pag ON pli.id_pagamento = pag.id_pagamento
                       WHERE pli.id_pedido_item = pi.id_pedido_item AND pag.status = 'CAPTURADO'
                   ) as is_paid
            FROM pedidos p
            JOIN pedidos_itens pi ON p.id_pedido = pi.id_pedido
            JOIN cardapio_itens ci ON pi.id_item = ci.id_item
            WHERE p.id_sessao = $1
            ORDER BY p.criado_em DESC
        `;
        const ordersRes = await pool.query(ordersQuery, [sessionId]);

        // Filtrar o total pendente (apenas itens não pagos)
        const totalPendente = ordersRes.rows
            .filter(r => !r.is_paid && r.status !== 'Cancelado')
            .reduce((acc, curr) => acc + (parseFloat(curr.valor_total) * curr.quantidade), 0);

        // Buscar detalhes da pool se existir
        const poolCheckRes = await pool.query(
            "SELECT id_pagamento, valor_total, status FROM pagamentos WHERE id_sessao = $1 AND status IN ('PENDENTE', 'CAPTURADO') ORDER BY criado_em DESC LIMIT 1",
            [sessionId]
        );

        let pool_info = null;
        if (poolCheckRes.rows.length > 0) {
            const poolData = poolCheckRes.rows[0];
            const sumRes = await pool.query("SELECT SUM(valor) as total_pago FROM pagamentos_divisoes WHERE id_pagamento = $1", [poolData.id_pagamento]);
            const total_pago = parseFloat(sumRes.rows[0].total_pago || 0);
            pool_info = {
                id: poolData.id_pagamento,
                total: parseFloat(poolData.valor_total),
                pago: total_pago,
                restante: Math.max(parseFloat(poolData.valor_total) - total_pago, 0),
                status: poolData.status
            };
        }

        res.json({
            identificador,
            chamar_garcom,
            status: 'ABERTA',
            sessao_id: sessionId,
            pedidos: ordersRes.rows,
            total_itens: totalPendente,
            pool: pool_info
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/waiter/tables/:tableId/close - Fechar Conta (Forcado pelo garcom)
app.post('/api/waiter/tables/:tableId/close', async (req, res) => {
    try {
        const { tableId } = req.params;
        await pool.query("UPDATE sessoes SET status = 'FECHADA' WHERE id_mesa = $1 AND status = 'ABERTA'", [tableId]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/waiter/tables/:tableId/open - Abrir Mesa (Forçado pelo garçom)
app.post('/api/waiter/tables/:tableId/open', async (req, res) => {
    const { tableId } = req.params;
    const { userId } = req.body; // Opcional: ID do garçom que está abrindo

    try {
        // 1. Verificar se já não há uma sessão aberta
        const check = await pool.query("SELECT id_sessao FROM sessoes WHERE id_mesa = $1 AND status = 'ABERTA'", [tableId]);
        if (check.rows.length > 0) {
            return res.status(400).json({ error: 'Mesa já possui uma sessão aberta' });
        }

        // 2. Criar nova sessão
        const result = await pool.query(
            "INSERT INTO sessoes (id_restaurante, id_mesa, id_usuario_criador, status) VALUES ($1, $2, $3, 'ABERTA') RETURNING id_sessao",
            [1, tableId, userId || 1] // Fallback para Admin ID 1 se não houver userId
        );

        res.json({ success: true, sessionId: result.rows[0].id_sessao });
    } catch (e) {
        console.error('Error opening table session:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/waiter/payment/confirm - Garçom confirma pagamento (Cartão na maquininha ou dinheiro)
app.post('/api/waiter/payment/confirm', async (req, res) => {
    const { sessionId, orderItemIds, totalAmount, waiterTip, contributorName } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Criar a pool (pagamento)
        const poolRes = await client.query(
            "INSERT INTO pagamentos (id_sessao, valor_total, status, metodo) VALUES ($1, $2, 'CAPTURADO', 'WAITER_DIRECT') RETURNING id_pagamento",
            [sessionId, totalAmount]
        );
        const poolId = poolRes.rows[0].id_pagamento;

        // 2. Vincular os itens à pool
        if (orderItemIds && orderItemIds.length > 0) {
            for (const itemId of orderItemIds) {
                await client.query(
                    'INSERT INTO pool_itens (id_pagamento, id_pedido_item) VALUES ($1, $2) ON CONFLICT (id_pedido_item) DO UPDATE SET id_pagamento = $1',
                    [poolId, itemId]
                );
            }
        }

        // 3. Registrar a contribuição (integral neste caso)
        await client.query(
            "INSERT INTO pagamentos_divisoes (id_pagamento, nome_contribuinte, valor, status) VALUES ($1, $2, $3, 'CAPTURADO')",
            [poolId, contributorName || 'Pagamento Garçom', totalAmount]
        );

        await client.query('COMMIT');
        res.json({ success: true, poolId });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error confirming waiter payment:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// POST /api/table/:tableId/call-waiter
app.post('/api/table/:tableId/call-waiter', async (req, res) => {
    try {
        const { tableId } = req.params;
        await pool.query(
            "UPDATE mesas SET chamar_garcom = true, chamar_garcom_em = CURRENT_TIMESTAMP WHERE id_mesa = $1",
            [tableId]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/table/:tableId/acknowledge-waiter
app.post('/api/table/:tableId/acknowledge-waiter', async (req, res) => {
    try {
        const { tableId } = req.params;
        await pool.query(
            "UPDATE mesas SET chamar_garcom = false WHERE id_mesa = $1",
            [tableId]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Roda a cada 10 minutos para limpar mesas se tiver passado do horario de fechamento + 30m
setInterval(async () => {
    try {
        const restRes = await pool.query("SELECT horario_fechamento FROM restaurantes WHERE id_restaurante = 1 AND horario_fechamento IS NOT NULL");
        if (restRes.rows.length === 0) return;

        const closeTimeStr = restRes.rows[0].horario_fechamento; // ex: "23:30:00"
        const [closeHour, closeMinute] = closeTimeStr.split(':').map(Number);

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        const closeTotalMinutes = (closeHour * 60) + closeMinute;
        const currentTotalMinutes = (currentHour * 60) + currentMinute;
        const toleranceMinutes = 30;

        let isClosedPeriod = false;

        // Se fecha à noite (ex 22:00)
        if (closeHour >= 12) {
            // Está fechado se passou da hora de fechar OU se ainda é madrugada (antes das 06:00 por exemplo)
            if (currentTotalMinutes >= (closeTotalMinutes + toleranceMinutes) || currentHour < 6) {
                isClosedPeriod = true;
            }
        }
        // Se fecha de madrugada (ex 02:00)
        else {
            if (currentTotalMinutes >= (closeTotalMinutes + toleranceMinutes) && currentHour < 12) {
                isClosedPeriod = true;
            }
        }

        if (isClosedPeriod) {
            // IMPORTANTE: Só fechar sessões criadas HÁ MAIS DE 2 HORAS.
            // Isso evita fechar sessões de teste abertas durante a manhã/madrugada.
            const res = await pool.query(
                "UPDATE sessoes SET status = 'FECHADA' WHERE status = 'ABERTA' AND criado_em < NOW() - INTERVAL '2 hours' RETURNING id_sessao;"
            );
            if (res.rowCount > 0) {
                console.log(`[Auto-Close] ${res.rowCount} sessoes antigas foram fechadas.`);
            }
        }
    } catch (e) {
        console.error('Error on auto-close cron:', e);
    }
}, 10 * 60 * 1000); // 10 minutes

// AUTO-CANCEL DELAYED ORDERS (30 minutes)
setInterval(async () => {
    try {
        const query = `
            UPDATE pedidos 
            SET status = 'Cancelado' 
            WHERE status = 'Recebido' 
            AND criado_em < NOW() - INTERVAL '30 minutes'
            RETURNING id_pedido
        `;
        const res = await pool.query(query);
        if (res.rowCount > 0) {
            console.log(`[Auto-Cancel] ${res.rowCount} pedidos atrasados foram cancelados.`);
        }
    } catch (e) {
        console.error('Error on auto-cancel orders:', e);
    }
}, 60 * 1000); // Run every 1 minute

const PORT = process.env.PORT || 4242;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
