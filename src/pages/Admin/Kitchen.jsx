import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Grid,
    Paper,
    Stack,
    Card,
    Chip,
    Button,
    Divider,
    IconButton
} from '@mui/material';
import { ChefHat, Clock, CheckCircle2, PlayCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getKitchenOrders, updateOrderStatus } from '../../utils/orderStore';

const Kitchen = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);

    const fetchOrdersData = async () => {
        // Agora busca todos os pedidos ativos do restaurante inteiro
        const active = await getKitchenOrders();
        setOrders(active);
    };

    useEffect(() => {
        fetchOrdersData();
        // Simple polling for a "real-time" feel without WebSockets
        const interval = setInterval(fetchOrdersData, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleStatusUpdate = async (orderId, newStatus) => {
        await updateOrderStatus(orderId, newStatus);
        fetchOrdersData();
    };

    const columns = [
        { title: 'Recebido', status: 'Recebido', color: '#1A1A1A', icon: <Clock size={20} /> },
        { title: 'Em Preparo', status: 'Preparando', color: '#FF8C00', icon: <PlayCircle size={20} /> },
        { title: 'Feito / Pronto', status: 'Pronto', color: '#2e7d32', icon: <CheckCircle2 size={20} /> },
    ];

    const getOrdersByStatus = (status) => orders.filter(o => o.status === status);

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: '#F4F4F4', minHeight: '100vh', pb: 10 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ bgcolor: '#1A1A1A', p: 1, borderRadius: 2 }}>
                        <ChefHat color="white" size={32} />
                    </Box>
                    <Box>
                        <Typography variant="h4" sx={{ fontWeight: 900 }}>Painel de Cozinha</Typography>
                        <Typography variant="body2" color="text.secondary">Tablet Mode • Atualização automática (5s)</Typography>
                    </Box>
                </Box>
                <Stack direction="row" spacing={2}>
                    <IconButton onClick={fetchOrdersData} sx={{ bgcolor: 'white', border: '1px solid #DDD' }}>
                        <RefreshCw size={20} />
                    </IconButton>
                    <Button variant="outlined" startIcon={<ArrowLeft />} onClick={() => navigate('/admin')}>Portal</Button>
                </Stack>
            </Stack>

            <Grid container spacing={3}>
                {columns.map((col) => (
                    <Grid size={{ xs: 12, md: 4 }} key={col.status}>
                        <Paper
                            elevation={0}
                            sx={{
                                p: 2,
                                borderRadius: 4,
                                bgcolor: '#FAFAFA',
                                border: `2px solid ${col.color}`,
                                minHeight: '80vh'
                            }}
                        >
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                                {col.icon}
                                <Typography variant="h6" sx={{ fontWeight: 800 }}>{col.title}</Typography>
                                <Chip
                                    label={getOrdersByStatus(col.status).length}
                                    size="small"
                                    sx={{ bgcolor: col.color, color: 'white', fontWeight: 800 }}
                                />
                            </Stack>

                            <Divider sx={{ mb: 3 }} />

                            <Stack spacing={2}>
                                {getOrdersByStatus(col.status).map((order) => (
                                    <Card key={order.id} sx={{ p: 2, borderRadius: 3, border: '1px solid #EEE' }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                                            PEDIDO #{order.orderId} • {order.tableIdentifier || `Mesa ${order.tableId}`}
                                        </Typography>
                                        <Typography variant="h5" sx={{ fontWeight: 900, mt: 1, color: '#1A1A1A' }}>
                                            {order.quantity}x {order.name}
                                        </Typography>

                                        {order.selectedAddons && order.selectedAddons.length > 0 && (
                                            <Box sx={{ mt: 1, p: 1, bgcolor: '#FFF8F0', borderRadius: 2, border: '1px solid #FFE0B2' }}>
                                                <Typography variant="caption" sx={{ fontWeight: 800, color: '#E65100', display: 'block', mb: 0.5 }}>
                                                    ADICIONAIS:
                                                </Typography>
                                                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                                                    {order.selectedAddons.map((addon, i) => (
                                                        <Chip
                                                            key={i}
                                                            label={addon.name}
                                                            size="small"
                                                            sx={{ bgcolor: 'white', fontWeight: 700, fontSize: '0.7rem' }}
                                                        />
                                                    ))}
                                                </Stack>
                                            </Box>
                                        )}

                                        {order.observations && (
                                            <Box sx={{ mt: 1, p: 1, bgcolor: '#E1F5FE', borderRadius: 2, border: '1px solid #B3E5FC' }}>
                                                <Typography variant="caption" sx={{ fontWeight: 800, color: '#01579B', display: 'block', mb: 0.2 }}>
                                                    OBSERVAÇÕES:
                                                </Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 700, fontStyle: 'italic', lineHeight: 1.2 }}>
                                                    "{order.observations}"
                                                </Typography>
                                            </Box>
                                        )}

                                        <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
                                            {col.status === 'Recebido' && (
                                                <Button
                                                    fullWidth
                                                    variant="contained"
                                                    color="warning"
                                                    sx={{ bgcolor: '#FF8C00', fontWeight: 700 }}
                                                    onClick={() => handleStatusUpdate(order.orderId, 'Preparando')}
                                                >
                                                    Começar
                                                </Button>
                                            )}
                                            {col.status === 'Preparando' && (
                                                <Button
                                                    fullWidth
                                                    variant="contained"
                                                    color="success"
                                                    sx={{ bgcolor: '#2e7d32', fontWeight: 700 }}
                                                    onClick={() => handleStatusUpdate(order.orderId, 'Pronto')}
                                                >
                                                    Pronto
                                                </Button>
                                            )}
                                            {col.status === 'Pronto' && (
                                                <Button
                                                    fullWidth
                                                    variant="outlined"
                                                    color="inherit"
                                                    sx={{ fontWeight: 700 }}
                                                    onClick={() => handleStatusUpdate(order.orderId, 'Entregue')}
                                                >
                                                    Entregue
                                                </Button>
                                            )}
                                        </Stack>
                                    </Card>
                                ))}
                            </Stack>
                        </Paper>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
};

export default Kitchen;
