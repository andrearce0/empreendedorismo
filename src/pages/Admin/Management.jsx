import React, { useState, useEffect } from 'react';
import ky from 'ky';
import {
    Box,
    Typography,
    Card,
    Grid,
    Stack,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Tab,
    Tabs,
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    IconButton,
    Snackbar,
    Alert,
    Avatar,
    Chip,
    FormControl,
    InputLabel,
    Select,
    OutlinedInput,
    MenuItem as MuiMenuItem
} from '@mui/material';
import {
    TrendingUp,
    DollarSign,
    ShoppingBag,
    Edit,
    Trash2,
    ArrowLeft,
    Plus,
    PieChart as PieChartIcon,
    BarChart as BarChartIcon,
    Settings as SettingsIcon,
    ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import { getMenu, addMenuItem, updateMenuItem, deleteMenuItem } from '../../utils/menuStore';
import { getOrders } from '../../utils/orderStore';
import { getOrderHistory } from '../../utils/userStore';

const Management = () => {
    const navigate = useNavigate();
    const [tab, setTab] = useState(0);
    const [menuItems, setMenuItems] = useState([]);
    const [history, setHistory] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [period, setPeriod] = useState('1m');
    const [loading, setLoading] = useState(true);
    const [stripeStatus, setStripeStatus] = useState({ connected: false, loading: true });

    // CRUD State
    const [openDialog, setOpenDialog] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        category: '',
        image: '',
        allergens: [],
        ingredients: '', // Will handle as comma-separated string in form
        addons: []
    });
    const [openSnackbar, setOpenSnackbar] = useState(false);
    const [snackbarMsg, setSnackbarMsg] = useState('');

    useEffect(() => {
        const fetchBaseData = async () => {
            const menu = await getMenu();
            setMenuItems(menu);
            const liveOrders = await getOrders();
            const mappedHistory = liveOrders.map(o => ({
                id: o.id,
                total: parseFloat(o.finalPrice || o.price),
                status: o.status,
                items: [o.name],
                date: new Date(o.timestamp).toISOString().split('T')[0]
            }));
            setHistory(mappedHistory);
        };
        fetchBaseData();
    }, []);

    useEffect(() => {
        const fetchMetrics = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem('token');
                if (!token) return;

                const data = await ky.get(`${import.meta.env.VITE_API_URL || 'http://localhost:4242'}/api/admin/metrics?period=${period}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }).json();
                setMetrics(data);
            } catch (e) {
                console.error('Error fetching metrics:', e);
            } finally {
                setLoading(false);
            }
        };

        const fetchStripeStatus = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) return;

                const status = await ky.get(`${import.meta.env.VITE_API_URL || 'http://localhost:4242'}/api/admin/stripe/status`, {
                    headers: { Authorization: `Bearer ${token}` }
                }).json();
                setStripeStatus({ ...status, loading: false });
            } catch (e) {
                console.error('Error fetching Stripe status:', e);
                setStripeStatus({ connected: false, loading: false });
            }
        };

        fetchMetrics();
        fetchStripeStatus();
    }, [period]);

    const handleStripeConnect = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                alert("Sessão expirada. Faça login novamente.");
                return;
            }

            const response = await ky.post(`${import.meta.env.VITE_API_URL || 'http://localhost:4242'}/api/admin/stripe/onboard`, {
                headers: { Authorization: `Bearer ${token}` }
            }).json();

            if (response.url) {
                window.location.href = response.url; // Redireciona para o fluxo do Stripe
            }
        } catch (e) {
            console.error('Error initiating Stripe connect:', e);
            alert("Erro ao conectar conta Stripe.");
        }
    };

    // KPI Metrics simplified from real data
    const totalRevenue = metrics?.revenue || 0;
    const totalOrders = metrics?.totalOrders || 0;

    const COLORS = ['#FF8C00', '#1A1A1A', '#757575', '#CCCCCC'];

    const handleOpenDialog = (item = null) => {
        if (item) {
            setEditingItem(item);
            setFormData({
                ...item,
                allergens: item.allergens || [],
                ingredients: (item.ingredients || []).join(', '),
                addons: item.addons || []
            });
        } else {
            setEditingItem(null);
            setFormData({
                name: '',
                description: '',
                price: '',
                category: 'Burgers',
                image: '',
                allergens: [],
                ingredients: '',
                addons: []
            });
        }
        setOpenDialog(true);
    };

    const handleSave = async () => {
        if (!formData.name || !formData.price || !formData.category) {
            alert('Por favor, preencha nome, preço e categoria.');
            return;
        }

        const itemToSave = {
            ...formData,
            ingredients: formData.ingredients.split(',').map(i => i.trim()).filter(i => i),
            price: parseFloat(formData.price)
        };

        if (editingItem) {
            await updateMenuItem(itemToSave);
            setSnackbarMsg('Item atualizado com sucesso!');
        } else {
            await addMenuItem(itemToSave);
            setSnackbarMsg('Item adicionado ao cardápio!');
        }

        const freshMenu = await getMenu();
        setMenuItems(freshMenu);
        setOpenDialog(false);
        setOpenSnackbar(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Excluir este item?')) {
            await deleteMenuItem(id);
            const freshMenu = await getMenu();
            setMenuItems(freshMenu);
            setSnackbarMsg('Item removido.');
            setOpenSnackbar(true);
        }
    };

    return (
        <Box sx={{ p: 4, bgcolor: '#FDFDFD', minHeight: '100vh', pb: 10 }}>
            <Stack spacing={3} sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                        <Typography variant="h4" sx={{ fontWeight: 900 }}>Management Dashboard</Typography>
                        <Typography variant="body2" color="text.secondary">Seja bem-vindo, Administrador.</Typography>
                    </Box>
                    <Button
                        startIcon={<ArrowLeft />}
                        onClick={() => navigate('/admin')}
                        sx={{ fontWeight: 700 }}
                    >
                        Painel Admin
                    </Button>
                </Box>

                <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 1, '&::-webkit-scrollbar': { display: 'none' } }}>
                    {['1d', '1w', '1m', '3m', '6m', '1y'].map((p) => (
                        <Button
                            key={p}
                            size="small"
                            variant={period === p ? 'contained' : 'outlined'}
                            onClick={() => setPeriod(p)}
                            sx={{
                                minWidth: 48,
                                borderRadius: 2,
                                fontWeight: 700,
                                bgcolor: period === p ? '#FF8C00' : 'transparent',
                                borderColor: period === p ? '#FF8C00' : '#DDD',
                                color: period === p ? 'white' : 'text.primary',
                                '&:hover': {
                                    bgcolor: period === p ? '#E67E00' : '#F5F5F5',
                                    borderColor: period === p ? '#E67E00' : '#CCC'
                                }
                            }}
                        >
                            {p.toUpperCase()}
                        </Button>
                    ))}
                </Stack>
            </Stack>

            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid size={{ xs: 12, sm: 4, md: 2 }}>
                    <Card sx={{ p: 2, borderRadius: 4, bgcolor: '#1A1A1A', color: 'white', minHeight: 110 }}>
                        <Typography variant="caption" sx={{ opacity: 0.7, display: 'block' }}>Receita</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 900 }}>R$ {totalRevenue.toFixed(2)}</Typography>
                    </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 4, md: 2 }}>
                    <Card sx={{ p: 2, borderRadius: 4, border: '1px solid #F0F0F0', minHeight: 110 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Pedidos</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 900 }}>{totalOrders}</Typography>
                    </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 4, md: 2 }}>
                    <Card sx={{ p: 2, borderRadius: 4, border: '1px solid #F0F0F0', minHeight: 110 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Mesas Livres</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 900 }}>{metrics?.tables?.empty || 0}/{metrics?.tables?.total || 0}</Typography>
                    </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 4, md: 2 }}>
                    <Card sx={{ p: 2, borderRadius: 4, border: '1px solid #F0F0F0', minHeight: 110 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Produção Ø</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 900 }}>{metrics?.performance?.avgProduction || 0}m</Typography>
                    </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 4, md: 2 }}>
                    <Card sx={{ p: 2, borderRadius: 4, border: '1px solid #F0F0F0', minHeight: 110 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Entrega Ø</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 900 }}>{metrics?.performance?.avgDelivery || 0}m</Typography>
                    </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 4, md: 2 }}>
                    <Card sx={{ p: 2, borderRadius: 4, border: '1px solid #F0F0F0', minHeight: 110 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Abandono</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 900, color: '#D32F2F' }}>{metrics?.abandonment || 0}</Typography>
                    </Card>
                </Grid>
            </Grid>

            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                <Tabs value={tab} onChange={(e, v) => setTab(v)} textColor="primary" indicatorColor="primary">
                    <Tab label="Overview" icon={<BarChartIcon size={18} />} iconPosition="start" />
                    <Tab label="Cardápio (CRUD)" icon={<Plus size={18} />} iconPosition="start" />
                    <Tab label="Histórico" icon={<PieChartIcon size={18} />} iconPosition="start" />
                    <Tab label="Configurações" icon={<SettingsIcon size={18} />} iconPosition="start" />
                </Tabs>
            </Box>

            {tab === 0 && (
                <Grid container spacing={3}>
                    <Grid size={{ xs: 12, md: 8 }}>
                        <Card sx={{ p: 3, borderRadius: 4, border: '1px solid #F0F0F0', minHeight: 400 }}>
                            <Typography variant="h6" sx={{ fontWeight: 800, mb: 3 }}>Evolução de Receita (R$)</Typography>
                            <Box sx={{ height: 300, width: '100%', minWidth: 0 }}>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={metrics?.revenueEvolution || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="date" axisLine={false} tickLine={false} />
                                        <YAxis axisLine={false} tickLine={false} />
                                        <Tooltip cursor={{ fill: '#F5F5F5' }} />
                                        <Bar dataKey="value" fill="#FF8C00" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </Box>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Card sx={{ p: 3, borderRadius: 4, border: '1px solid #F0F0F0', minHeight: 400 }}>
                            <Typography variant="h6" sx={{ fontWeight: 800, mb: 3 }}>Horários de Pico (Pedidos)</Typography>
                            <Box sx={{ height: 300, width: '100%', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={metrics?.peakHours || []} layout="vertical" margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="hour" type="category" axisLine={false} tickLine={false} width={40} />
                                        <Tooltip cursor={{ fill: '#F5F5F5' }} />
                                        <Bar dataKey="count" fill="#1A1A1A" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
                                Total abandono: {metrics?.abandonment || 0} mesas
                            </Typography>
                        </Card>
                    </Grid>
                </Grid>
            )}

            {tab === 1 && (
                <Box>
                    <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
                        <Button
                            variant="contained"
                            startIcon={<Plus />}
                            onClick={() => handleOpenDialog()}
                        >
                            Novo Item
                        </Button>
                    </Stack>
                    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #F0F0F0', borderRadius: 4 }}>
                        <Table>
                            <TableHead sx={{ bgcolor: '#F8F9FA' }}>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Categoria</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Preço</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>Ações</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {menuItems.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <Stack direction="row" spacing={2} alignItems="center">
                                                <Avatar src={item.image} variant="rounded" sx={{ width: 40, height: 40 }} />
                                                <Box>
                                                    <Typography sx={{ fontWeight: 700 }}>{item.name}</Typography>
                                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {item.description}
                                                    </Typography>
                                                </Box>
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">{item.category}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 700 }}>R$ {item.price.toFixed(2)}</Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <IconButton onClick={() => handleOpenDialog(item)} size="small" sx={{ mr: 1, color: '#FF8C00' }}>
                                                <Edit size={18} />
                                            </IconButton>
                                            <IconButton onClick={() => handleDelete(item.id)} size="small" color="error">
                                                <Trash2 size={18} />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            )}

            {tab === 2 && (
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #F0F0F0', borderRadius: 4 }}>
                    <Table>
                        <TableHead sx={{ bgcolor: '#F8F9FA' }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>ID Pedido</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Data</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Itens</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Valor</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {history.map((order) => (
                                <TableRow key={order.id}>
                                    <TableCell sx={{ fontWeight: 700 }}>{order.id}</TableCell>
                                    <TableCell>{order.date}</TableCell>
                                    <TableCell>
                                        <Typography variant="caption">{order.items.join(', ')}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>R$ {order.total.toFixed(2)}</TableCell>
                                    <TableCell align="right">
                                        <Chip label={order.status} size="small" color="success" />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {tab === 3 && (
                <Grid container spacing={3}>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Card sx={{ p: 4, borderRadius: 4, border: '1px solid #F0F0F0' }}>
                            <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                Pagamentos e Repasses
                                <Chip label="Stripe Connect" size="small" sx={{ bgcolor: '#635BFF', color: 'white', fontWeight: 700 }} />
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                                Conecte sua conta do Stripe para receber os pagamentos automaticamente na sua conta bancária. A taxa de serviço da plataforma (3%) já é descontada automaticamente na hora da transação.
                            </Typography>

                            {stripeStatus.loading ? (
                                <Typography variant="body2">Verificando status de conexão...</Typography>
                            ) : stripeStatus.connected ? (
                                <Box sx={{ p: 3, bgcolor: '#E8F5E9', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Avatar sx={{ bgcolor: '#4CAF50', width: 40, height: 40 }}>$</Avatar>
                                    <Box>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#2E7D32' }}>Conta Conectada!</Typography>
                                        <Typography variant="caption" sx={{ color: '#2E7D32', display: 'block' }}>
                                            Repasses automáticos ativos.
                                            {stripeStatus.details_submitted ? "" : " (Faltam informações no onboarding)"}
                                        </Typography>
                                    </Box>
                                    {!stripeStatus.details_submitted && (
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={handleStripeConnect}
                                            sx={{ ml: 'auto', borderColor: '#4CAF50', color: '#4CAF50' }}
                                        >
                                            Completar Cadastro
                                        </Button>
                                    )}
                                </Box>
                            ) : (
                                <Box sx={{ textAlign: 'center', p: 4, bgcolor: '#FAFAFA', borderRadius: 3, border: '1px dashed #DDD' }}>
                                    <DollarSign size={40} color="#757575" style={{ marginBottom: 16 }} />
                                    <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Receba com Stripe</Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                        Crie ou conecte sua conta Express para habilitar os pagamentos na mesa.
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        onClick={handleStripeConnect}
                                        endIcon={<ExternalLink size={16} />}
                                        sx={{
                                            bgcolor: '#635BFF',
                                            color: 'white',
                                            fontWeight: 800,
                                            px: 4,
                                            py: 1.5,
                                            borderRadius: 2,
                                            '&:hover': { bgcolor: '#5851DE' }
                                        }}
                                    >
                                        Conectar Conta Stripe
                                    </Button>
                                </Box>
                            )}
                        </Card>
                    </Grid>
                </Grid>
            )}

            {/* Item Editor Dialog */}
            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 800 }}>{editingItem ? 'Editar Item' : 'Novo Item'}</DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <TextField
                            label="Nome do Item"
                            fullWidth
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                        <TextField
                            label="Descrição"
                            fullWidth
                            multiline
                            rows={2}
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 6 }}>
                                <TextField
                                    label="Preço (R$)"
                                    type="number"
                                    fullWidth
                                    value={formData.price}
                                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                                />
                            </Grid>
                            <Grid size={{ xs: 6 }}>
                                <TextField
                                    select
                                    label="Categoria"
                                    fullWidth
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                >
                                    <MuiMenuItem value="Burgers">Burgers</MuiMenuItem>
                                    <MuiMenuItem value="Drinks">Drinks (Bebidas)</MuiMenuItem>
                                    <MuiMenuItem value="Sides">Sides (Acompanhamentos)</MuiMenuItem>
                                    <MuiMenuItem value="Desserts">Desserts (Sobremesas)</MuiMenuItem>
                                </TextField>
                            </Grid>
                        </Grid>
                        <TextField
                            label="URL da Imagem"
                            fullWidth
                            value={formData.image}
                            onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                        />

                        <TextField
                            label="Ingredientes (separados por vírgula)"
                            fullWidth
                            multiline
                            rows={2}
                            value={formData.ingredients}
                            onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })}
                            placeholder="Ex: Carne, Pão, Alface..."
                        />

                        <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Adicionais Pagos</Typography>
                            {formData.addons.map((addon, index) => (
                                <Stack key={index} direction="row" spacing={1} sx={{ mb: 1 }}>
                                    <TextField
                                        size="small"
                                        label="Nome"
                                        value={addon.name}
                                        onChange={(e) => {
                                            const newAddons = [...formData.addons];
                                            newAddons[index].name = e.target.value;
                                            setFormData({ ...formData, addons: newAddons });
                                        }}
                                    />
                                    <TextField
                                        size="small"
                                        label="Preço"
                                        type="number"
                                        value={addon.price}
                                        onChange={(e) => {
                                            const newAddons = [...formData.addons];
                                            newAddons[index].price = parseFloat(e.target.value);
                                            setFormData({ ...formData, addons: newAddons });
                                        }}
                                        sx={{ width: 100 }}
                                    />
                                    <IconButton color="error" onClick={() => {
                                        const newAddons = formData.addons.filter((_, i) => i !== index);
                                        setFormData({ ...formData, addons: newAddons });
                                    }}>
                                        <Trash2 size={18} />
                                    </IconButton>
                                </Stack>
                            ))}
                            <Button
                                startIcon={<Plus size={16} />}
                                size="small"
                                onClick={() => setFormData({ ...formData, addons: [...formData.addons, { name: '', price: 0 }] })}
                            >
                                Novo Adicional
                            </Button>
                        </Box>

                        <FormControl fullWidth>
                            <InputLabel>Alérgenos</InputLabel>
                            <Select
                                multiple
                                value={formData.allergens || []}
                                onChange={(e) => setFormData({ ...formData, allergens: e.target.value })}
                                input={<OutlinedInput label="Alérgenos" />}
                                renderValue={(selected) => (
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                        {selected.map((value) => (
                                            <Chip key={value} label={value} size="small" />
                                        ))}
                                    </Box>
                                )}
                            >
                                {['Glúten', 'Lactose', 'Amendoim', 'Ovos', 'Peixes', 'Soja'].map((name) => (
                                    <MuiMenuItem key={name} value={name}>
                                        {name}
                                    </MuiMenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {formData.image && (
                            <Box sx={{ mt: 1, textAlign: 'center' }}>
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                    Prévia da Imagem:
                                </Typography>
                                <Box
                                    component="img"
                                    src={formData.image}
                                    sx={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 2, border: '1px solid #EEE' }}
                                    onError={(e) => e.target.style.display = 'none'}
                                />
                            </Box>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenDialog(false)} color="inherit">Cancelar</Button>
                    <Button variant="contained" onClick={handleSave} sx={{ bgcolor: '#FF8C00', '&:hover': { bgcolor: '#E67E00' } }}>
                        {editingItem ? 'Salvar Alterações' : 'Criar Item'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={openSnackbar}
                autoHideDuration={3000}
                onClose={() => setOpenSnackbar(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert severity="success" sx={{ width: '100%', borderRadius: 2, fontWeight: 700 }}>
                    {snackbarMsg}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default Management;
