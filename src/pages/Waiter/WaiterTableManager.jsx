import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
//import { Box, Typography, Button, Card, Stack, Divider, CircularProgress, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItemButton, ListItemText, ListItemAvatar, Avatar, TextField, Grid } from '@mui/material';
//import { Box, Typography, Button, Card, Stack, Divider, CircularProgress, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItemButton, ListItemText, ListItemAvatar, Avatar, TextField } from '@mui/material';
import { Box, Typography, Button, Card, Stack, Divider, CircularProgress, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemButton, ListItemText, ListItemAvatar, Avatar, TextField, Grid, Checkbox, FormControlLabel, Chip } from '@mui/material';
import { Camera, ArrowLeft, ShoppingBag, X, Search, Play, CreditCard, BellRing, CheckCircle2 } from 'lucide-react';
import Tesseract from 'tesseract.js';
import ky from 'ky';
import ItemDetailsModal from '../../components/ItemDetailsModal';
import { acknowledgeWaiter } from '../../utils/tableStore';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4242';
const RESTAURANT_SLUG = import.meta.env.VITE_RESTAURANT_SLUG || 'restaurante-demo';

const WaiterTableManager = () => {
    const { tableId } = useParams();
    const navigate = useNavigate();
    const [tableDetails, setTableDetails] = useState(null);
    const [loading, setLoading] = useState(true);

    // OCR State
    const [ocrLoading, setOcrLoading] = useState(false);
    const [ocrResult, setOcrResult] = useState('');
    const fileInputRef = useRef(null);

    // --- NOVO: Estados para o Lançamento de Pedidos ---
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuItems, setMenuItems] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [observations, setObservations] = useState('');
    const [submittingOrder, setSubmittingOrder] = useState(false);
    const [waiterTipPercent, setWaiterTipPercent] = useState(10);
    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [selectedOrderItemIds, setSelectedOrderItemIds] = useState([]);
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [cardData, setCardData] = useState({ number: '', name: '', expiry: '', cvc: '' });
    const [submittingPayment, setSubmittingPayment] = useState(false);

    // Função para buscar os dados da mesa (separada para podermos recarregar depois de um pedido)
    const fetchTableDetails = async () => {
        try {
            const data = await ky.get(`${BASE_URL}/api/waiter/tables/${tableId}`).json();
            setTableDetails(data);
        } catch (err) {
            console.error("Error fetching table details:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTableDetails();
    }, [tableId]);

    // --- NOVO: Funções do Menu ---
    const handleOpenMenu = async () => {
        setMenuOpen(true);
        if (menuItems.length === 0) {
            try {
                const data = await ky.get(`${BASE_URL}/api/menu?slug=${RESTAURANT_SLUG}`).json();
                setMenuItems(data);
            } catch (err) {
                console.error('Erro ao buscar cardápio', err);
                alert('Falha ao carregar o cardápio.');
            }
        }
    };

    const handleSelectMenuItem = (item) => {
        setSelectedItem(item);
        setDetailsModalOpen(true);
    };

    const handleConfirmOrder = async (item, addons, observationText, quantity) => {
        if (!item || !tableDetails?.sessao_id) return;

        setSubmittingOrder(true);
        try {
            // Replicando a lógica do Menu.jsx: loop para quantidade
            for (let i = 0; i < quantity; i++) {
                await ky.post(`${BASE_URL}/api/orders`, {
                    json: {
                        item: item,
                        selectedAddons: addons,
                        observations: observationText,
                        sessionId: tableDetails.sessao_id
                    }
                }).json();
            }

            // Sucesso!
            setMenuOpen(false);
            setDetailsModalOpen(false);
            setSelectedItem(null);
            await fetchTableDetails();

        } catch (err) {
            console.error(err);
            alert('Erro ao lançar pedido. Verifique se a mesa está aberta.');
        } finally {
            setSubmittingOrder(false);
        }
    };

    // --- Funções Originais ---
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setOcrLoading(true);
        setOcrResult('');

        try {
            const result = await Tesseract.recognize(file, 'eng');
            const text = result.data.text;
            const cardRegex = /(?:\d[ -]*?){13,16}/g;
            const matches = text.match(cardRegex);

            if (matches && matches.length > 0) {
                const cleanestMatch = matches[0].replace(/[ -]/g, '');
                setOcrResult(cleanestMatch);
                setCardData(prev => ({ ...prev, number: cleanestMatch }));
                alert(`Cartão Lido: **** **** **** ${cleanestMatch.slice(-4)}`);
            } else {
                alert('Não foi possível ler os números do cartão. Tente novamente com mais luz.');
            }
        } catch (error) {
            console.error(error);
            alert('Erro ao processar imagem.');
        } finally {
            setOcrLoading(false);
        }
    };

    const handleCloseTableSession = async () => {
        if (!window.confirm('Tem certeza que deseja fechar esta mesa? Os clientes não poderão mais fazer pedidos.')) return;

        try {
            await ky.post(`${BASE_URL}/api/waiter/tables/${tableId}/close`).json();
            alert('Mesa fechada com sucesso!');
            navigate('/waiter');
        } catch (e) {
            alert('Erro ao fechar mesa.');
        }
    };

    const handleConfirmWaiterPayment = async () => {
        if (selectedOrderItemIds.length === 0) return;
        setSubmittingPayment(true);
        try {
            await ky.post(`${BASE_URL}/api/waiter/payment/confirm`, {
                json: {
                    sessionId: tableDetails.sessao_id,
                    orderItemIds: selectedOrderItemIds,
                    totalAmount: totalComExtras,
                    waiterTip: totalComExtras - (totalComExtras / (1 + (waiterTipPercent / 100) + 0.03)), // Aproximado
                    contributorName: cardData.name || 'Cliente (Garçom)'
                }
            }).json();

            alert('Pagamento registrado com sucesso!');
            setPaymentModalOpen(false);
            setSelectedOrderItemIds([]);
            setCardData({ number: '', name: '', expiry: '', cvc: '' });
            await fetchTableDetails();
        } catch (e) {
            console.error(e);
            alert('Erro ao processar pagamento.');
        } finally {
            setSubmittingPayment(false);
        }
    };

    const toggleItemSelection = (id) => {
        setSelectedOrderItemIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const selectedOrders = tableDetails?.pedidos?.filter(p => selectedOrderItemIds.includes(p.id_pedido_item)) || [];
    const subtotalSelecionado = selectedOrders.reduce((acc, curr) => acc + (parseFloat(curr.valor_total) * curr.quantidade), 0);
    const totalComExtras = subtotalSelecionado * (1 + (waiterTipPercent / 100) + 0.03);

    const handleOpenTableSession = async () => {
        if (!window.confirm('Deseja abrir esta mesa agora?')) return;

        try {
            const user = JSON.parse(localStorage.getItem('restaurant_user_v1'));
            await ky.post(`${BASE_URL}/api/waiter/tables/${tableId}/open`, {
                json: { userId: user?.id }
            }).json();

            alert('Mesa aberta com sucesso!');
            await fetchTableDetails();
        } catch (e) {
            const error = await e.response?.json();
            alert(error?.error || 'Erro ao abrir mesa.');
        }
    };

    const handleAcknowledgeCall = async () => {
        try {
            await acknowledgeWaiter(tableId);
            await fetchTableDetails();
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', mt: 10, justifyContent: 'center' }}><CircularProgress /></Box>;
    if (!tableDetails) return <Typography>Mesa não encontrada</Typography>;

    const isActive = tableDetails.status === 'ABERTA';

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 4, justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <IconButton onClick={() => navigate('/waiter')} sx={{ mr: 2 }}><ArrowLeft /></IconButton>
                    <Typography variant="h4" sx={{ fontWeight: 900 }}>Mesa {tableDetails.identificador}</Typography>
                </Box>
                {tableDetails.chamar_garcom && (
                    <Chip
                        icon={<BellRing size={18} color="#D32F2F" />}
                        label="CHAMANDO GARÇOM"
                        onClick={handleAcknowledgeCall}
                        onDelete={handleAcknowledgeCall}
                        deleteIcon={<CheckCircle2 size={18} color="#D32F2F" />}
                        sx={{
                            bgcolor: '#FFEBEE',
                            color: '#D32F2F',
                            fontWeight: 900,
                            p: 2,
                            height: 45,
                            borderRadius: 3,
                            animation: 'pulse 1.5s infinite',
                            border: '1px solid #FFCDD2',
                            '& .MuiChip-label': { px: 2 }
                        }}
                    />
                )}
            </Box>

            <Grid container spacing={4}>
                {/* General Info / Actions */}
                <Grid size={{ xs: 12, md: 5 }}>
                    <Card elevation={0} sx={{ p: 3, borderRadius: 4, mb: 3, border: '1px solid #E5E7EB' }}>
                        <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>Ações Rápidas</Typography>

                        <Stack spacing={2}>
                            <Button
                                variant="outlined"
                                startIcon={<ShoppingBag />}
                                fullWidth
                                disabled={!isActive}
                                onClick={handleOpenMenu}
                                sx={{ height: 50, fontWeight: 700, borderColor: '#FF8C00', color: '#FF8C00', '&:hover': { borderColor: '#E67E00', bgcolor: '#FFF5E6' } }}
                            >
                                Lançar Novo Pedido
                            </Button>

                            {isActive ? (
                                <Button
                                    variant="contained"
                                    color="error"
                                    startIcon={<X />}
                                    fullWidth
                                    onClick={handleCloseTableSession}
                                    sx={{ height: 50, fontWeight: 700 }}
                                >
                                    Fechar Conta/Sessão da Mesa
                                </Button>
                            ) : (
                                <Button
                                    variant="contained"
                                    startIcon={<Play size={18} />}
                                    sx={{ bgcolor: '#FF8C00', '&:hover': { bgcolor: '#E67E00' }, height: 50, fontWeight: 700 }}
                                    fullWidth
                                    onClick={handleOpenTableSession}
                                >
                                    Abrir Nova Sessão
                                </Button>
                            )}
                        </Stack>
                    </Card>

                    {/* OCR Scanner */}
                    <Card elevation={0} sx={{ p: 3, borderRadius: 4, border: '1px solid #E5E7EB', bgcolor: '#FFF5E6' }}>
                        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1, color: '#FF8C00' }}>Câmera (OCR Pagamento)</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Escaneie a frente do cartão do cliente para preencher a cobrança automaticamente.
                        </Typography>

                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: 'none' }}
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                        />

                        <Button
                            variant="contained"
                            startIcon={ocrLoading ? <CircularProgress size={20} color="inherit" /> : <Camera />}
                            fullWidth
                            disabled={ocrLoading || !isActive}
                            sx={{ bgcolor: '#FF8C00', '&:hover': { bgcolor: '#E67E00' }, height: 50, fontWeight: 700 }}
                            onClick={() => fileInputRef.current.click()}
                        >
                            {ocrLoading ? 'Analisando Imagem...' : 'Escanear Cartão'}
                        </Button>

                        {ocrResult && (
                            <Box sx={{ mt: 2, p: 2, bgcolor: 'white', borderRadius: 2, border: '1px solid #FFE0B2' }}>
                                <Typography variant="caption" color="text.secondary">Número Detectado:</Typography>
                                <Typography variant="body1" sx={{ fontWeight: 800, letterSpacing: 2 }}>
                                    **** **** **** {ocrResult.slice(-4)}
                                </Typography>
                            </Box>
                        )}
                    </Card>
                </Grid>

                {/* Account Summary */}
                <Grid size={{ xs: 12, md: 7 }}>
                    <Card elevation={0} sx={{ p: 3, borderRadius: 4, border: '1px solid #E5E7EB' }}>
                        <Typography variant="h6" sx={{ fontWeight: 800, mb: 3 }}>Extrato de Pagamento</Typography>

                        {tableDetails.pedidos && tableDetails.pedidos.length > 0 ? (
                            <List disablePadding>
                                {tableDetails.pedidos.map((p, idx) => (
                                    <React.Fragment key={p.id_pedido_item || idx}>
                                        <ListItem
                                            sx={{
                                                px: 0,
                                                opacity: p.is_paid ? 0.5 : 1,
                                                bgcolor: selectedOrderItemIds.includes(p.id_pedido_item) ? '#FFF9F0' : 'transparent',
                                                borderRadius: 2,
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {!p.is_paid && (
                                                <Checkbox
                                                    size="small"
                                                    checked={selectedOrderItemIds.includes(p.id_pedido_item)}
                                                    onChange={() => toggleItemSelection(p.id_pedido_item)}
                                                    sx={{ color: '#FF8C00', '&.Mui-checked': { color: '#FF8C00' } }}
                                                />
                                            )}
                                            <ListItemText
                                                primary={
                                                    <Typography sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        {p.quantidade}x {p.nome_item}
                                                        {p.is_paid && <Chip label="Pago" size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />}
                                                    </Typography>
                                                }
                                                secondary={p.status}
                                            />
                                            <Typography sx={{ fontWeight: 800 }}>R$ {parseFloat(p.valor_total).toFixed(2)}</Typography>
                                        </ListItem>
                                        {idx < tableDetails.pedidos.length - 1 && <Divider />}
                                    </React.Fragment>
                                ))}

                                <Divider sx={{ my: 2, borderStyle: 'dashed' }} />

                                <Stack spacing={1}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography color="text.secondary">Subtotal Itens</Typography>
                                        <Typography sx={{ fontWeight: 600 }}>R$ {parseFloat(tableDetails.total_itens || 0).toFixed(2)}</Typography>
                                    </Box>

                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                                        <Typography color="text.secondary">Gorjeta Sugerida</Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <TextField
                                                type="number"
                                                size="small"
                                                variant="standard"
                                                value={waiterTipPercent}
                                                onChange={(e) => setWaiterTipPercent(Math.max(0, parseFloat(e.target.value) || 0))}
                                                disabled={!!tableDetails.pool}
                                                sx={{ width: 60, '& input': { textAlign: 'right', fontWeight: 700 } }}
                                                InputProps={{ endAdornment: <Typography variant="caption">%</Typography> }}
                                            />
                                        </Box>
                                    </Box>

                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography color="text.secondary">Taxa do App (3%)</Typography>
                                        <Typography sx={{ fontWeight: 600 }}>R$ {(parseFloat(tableDetails.total_itens || 0) * 0.03).toFixed(2)}</Typography>
                                    </Box>

                                    <Divider sx={{ my: 2 }} />

                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="h6" sx={{ fontWeight: 900 }}>
                                            {selectedOrderItemIds.length > 0 ? 'Total Selecionado' : 'Total Pendente'}
                                        </Typography>
                                        <Box sx={{ textAlign: 'right' }}>
                                            <Typography variant="h5" sx={{ fontWeight: 900, color: '#FF8C00' }}>
                                                R$ {(
                                                    selectedOrderItemIds.length > 0 ? totalComExtras :
                                                        (parseFloat(tableDetails.total_itens || 0) * (1 + (waiterTipPercent / 100) + 0.03))
                                                ).toFixed(2)}
                                            </Typography>
                                            {selectedOrderItemIds.length > 0 && (
                                                <Typography variant="caption" color="text.secondary">
                                                    {selectedOrderItemIds.length} itens selecionados
                                                </Typography>
                                            )}
                                        </Box>
                                    </Box>

                                    {selectedOrderItemIds.length > 0 && (
                                        <Button
                                            variant="contained"
                                            fullWidth
                                            startIcon={<CreditCard />}
                                            onClick={() => setPaymentModalOpen(true)}
                                            sx={{ mt: 2, bgcolor: '#1A1A1A', height: 50, borderRadius: 3, fontWeight: 800, '&:hover': { bgcolor: '#000' } }}
                                        >
                                            Pagar Selecionados (R$ {totalComExtras.toFixed(2)})
                                        </Button>
                                    )}

                                    {tableDetails.pool && (
                                        <Box sx={{ mt: 2, p: 2, bgcolor: '#F0FDF4', borderRadius: 2, border: '1px solid #BBF7D0' }}>
                                            <Typography variant="caption" sx={{ color: '#166534', fontWeight: 800, display: 'block', mb: 1 }}>STATUS DO PAGAMENTO (POOL)</Typography>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                <Typography variant="body2">Já Pago:</Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 700, color: '#166534' }}>R$ {tableDetails.pool.pago.toFixed(2)}</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2">Restante:</Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 700, color: '#991B1B' }}>R$ {tableDetails.pool.restante.toFixed(2)}</Typography>
                                            </Box>
                                        </Box>
                                    )}
                                </Stack>
                            </List>
                        ) : (
                            <Typography color="text.secondary">Nenhum pedido nesta sessão ainda.</Typography>
                        )}
                    </Card>
                </Grid>
            </Grid>

            {/* --- MODAL DE SELEÇÃO DE ITEM DO CARDÁPIO --- */}
            <Dialog
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Cardápio</DialogTitle>
                <DialogContent dividers sx={{ p: 0 }}>
                    <List disablePadding>
                        {menuItems.map((item) => (
                            <ListItemButton key={item.id} onClick={() => handleSelectMenuItem(item)} sx={{ p: 2, borderBottom: '1px solid #f0f0f0' }}>
                                <ListItemAvatar>
                                    <Avatar src={item.image} variant="rounded" sx={{ width: 56, height: 56, mr: 2 }} />
                                </ListItemAvatar>
                                <ListItemText
                                    primary={<Typography sx={{ fontWeight: 700 }}>{item.name}</Typography>}
                                    secondary={<Typography variant="body2" color="text.secondary" noWrap>{item.description}</Typography>}
                                />
                                <Typography sx={{ fontWeight: 800, color: '#FF8C00' }}>R$ {item.price.toFixed(2)}</Typography>
                            </ListItemButton>
                        ))}
                        {menuItems.length === 0 && (
                            <Box sx={{ p: 4, textAlign: 'center' }}>
                                <CircularProgress size={24} />
                            </Box>
                        )}
                    </List>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setMenuOpen(false)} sx={{ color: '#757575' }}>Cancelar</Button>
                </DialogActions>
            </Dialog>

            {/* Modal de Detalhes Completo - O mesmo do Cliente */}
            <ItemDetailsModal
                open={detailsModalOpen}
                onClose={() => setDetailsModalOpen(false)}
                item={selectedItem}
                onAdd={handleConfirmOrder}
            />

            {/* Modal de Pagamento */}
            <Dialog open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle sx={{ fontWeight: 800 }}>Processar Pagamento</DialogTitle>
                <DialogContent dividers>
                    <Typography variant="h6" sx={{ textAlign: 'center', mb: 3, fontWeight: 900, color: '#FF8C00' }}>
                        Total: R$ {totalComExtras.toFixed(2)}
                    </Typography>

                    <Stack spacing={2}>
                        <TextField
                            label="Número do Cartão"
                            fullWidth
                            value={cardData.number}
                            onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                const masked = val.replace(/(.{4})/g, '$1 ').trim().slice(0, 19);
                                setCardData({ ...cardData, number: masked });
                            }}
                            placeholder="0000 0000 0000 0000"
                        />
                        <TextField
                            label="Nome no Cartão"
                            fullWidth
                            value={cardData.name}
                            onChange={(e) => setCardData({ ...cardData, name: e.target.value })}
                        />
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 6 }}>
                                <TextField
                                    label="Validade"
                                    fullWidth
                                    value={cardData.expiry}
                                    onChange={(e) => {
                                        let val = e.target.value.replace(/\D/g, '');
                                        if (val.length > 2) val = val.substring(0, 2) + '/' + val.substring(2, 4);
                                        setCardData({ ...cardData, expiry: val.slice(0, 5) });
                                    }}
                                    placeholder="MM/AA"
                                />
                            </Grid>
                            <Grid size={{ xs: 6 }}>
                                <TextField
                                    label="CVC"
                                    fullWidth
                                    value={cardData.cvc}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                        setCardData({ ...cardData, cvc: val });
                                    }}
                                    placeholder="123"
                                />
                            </Grid>
                        </Grid>
                    </Stack>

                    <Box sx={{ mt: 3, p: 2, bgcolor: '#FFF5E6', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Camera size={20} color="#FF8C00" />
                        <Typography variant="body2" color="text.secondary">
                            Dica: Use o escâner de cartão na tela anterior para preenchimento rápido.
                        </Typography>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2.5 }}>
                    <Button onClick={() => setPaymentModalOpen(false)} sx={{ color: '#757575' }}>Cancelar</Button>
                    <Button
                        variant="contained"
                        disabled={submittingPayment}
                        onClick={handleConfirmWaiterPayment}
                        sx={{ bgcolor: '#FF8C00', '&:hover': { bgcolor: '#E67E00' }, fontWeight: 800, px: 4 }}
                    >
                        {submittingPayment ? <CircularProgress size={24} color="inherit" /> : 'Confirmar Pagamento'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default WaiterTableManager;