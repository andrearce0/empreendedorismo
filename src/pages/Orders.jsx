import React, { useState, useEffect } from 'react';
import {
    Typography,
    Box,
    List,
    ListItem,
    ListItemText,
    ListItemAvatar,
    Avatar,
    Chip,
    Divider,
    Stack,
    IconButton,
    Menu,
    MenuItem as MuiMenuItem,
    Button,
    Card
} from '@mui/material';
import { MoreVertical, CheckCircle2, Clock, Utensils, AlertCircle, XCircle } from 'lucide-react';
import { getOrders, updateOrderStatus } from '../utils/orderStore';
import { getTableSession } from '../utils/tableStore';

const statusColors = {
    'Recebido': { color: '#757575', icon: <Clock size={16} />, bg: '#F5F5F5', label: 'Recebido' },
    'Preparando': { color: '#0288d1', icon: <Utensils size={16} />, bg: '#E1F5FE', label: 'Na Cozinha' },
    'Pronto': { color: '#2E7D32', icon: <CheckCircle2 size={16} />, bg: '#E8F5E9', label: 'Pronto!' },
    'Entregue': { color: '#ED6C02', icon: <CheckCircle2 size={16} />, bg: '#FFF3E0', label: 'Entregue' },
    'Cancelado': { color: '#D32F2F', icon: <XCircle size={16} />, bg: '#FFEBEE', label: 'Cancelado' }
};

const Orders = () => {
    const [orders, setOrders] = useState([]);
    const [anchorEl, setAnchorEl] = useState(null);
    // Mudamos de selectedOrderId para o objeto selectedOrder inteiro para saber o status dele no menu
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchOrders = async () => {
        const session = getTableSession();
        if (!session) {
            setLoading(false);
            return;
        }
        const data = await getOrders(session.sessionId);
        const sortedData = data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setOrders(sortedData);
        setLoading(false);
    };

    useEffect(() => {
        fetchOrders();
        const interval = setInterval(fetchOrders, 15000);
        return () => clearInterval(interval);
    }, []);

    const handleMenuOpen = (event, order) => {
        setAnchorEl(event.currentTarget);
        setSelectedOrder(order);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
        setSelectedOrder(null);
    };

    const handleStatusChange = async (newStatus) => {
        if (!selectedOrder) return;

        const session = getTableSession();

        await updateOrderStatus(selectedOrder.id, newStatus, session?.sessionId);

        await fetchOrders();
        handleMenuClose();
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 10, gap: 2 }}>
                <Box className="pulse" sx={{ p: 2, bgcolor: '#F5F5F5', borderRadius: '50%' }}>
                    <Clock size={32} color="#999" />
                </Box>
                <Typography sx={{ color: 'var(--text-muted)', fontWeight: 600 }}>Sincronizando pedidos...</Typography>
            </Box>
        );
    }

    if (orders.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', mt: 8, px: 3 }}>
                <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
                    <Box sx={{ p: 3, bgcolor: '#F5F5F5', borderRadius: '32px' }}>
                        <Utensils size={64} color="#CCC" />
                    </Box>
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 900, mb: 1, color: 'var(--text-main)' }}>Nenhum pedido ainda</Typography>
                <Typography variant="body1" sx={{ color: 'var(--text-muted)', mb: 4 }}>
                    Seus pedidos aparecerão aqui assim que você escolher algo no menu.
                </Typography>
                <Button
                    variant="contained"
                    fullWidth
                    href="/menu"
                    sx={{
                        bgcolor: 'var(--primary)', fontWeight: 900, borderRadius: '18px', py: 2,
                        '&:hover': { bgcolor: 'var(--primary-hover)' }
                    }}
                >
                    Explorar Menu
                </Button>
            </Box>
        );
    }

    return (
        <Box sx={{ pb: 8 }}>
            <Typography variant="h4" sx={{ fontWeight: 900, mb: 1, letterSpacing: -1 }}>
                Meus Pedidos
            </Typography>
            <Typography variant="body1" sx={{ color: 'var(--text-muted)', mb: 4, fontWeight: 500 }}>
                Acompanhe o status de cada item em tempo real.
            </Typography>

            <Stack spacing={2.5}>
                {orders.map((order, index) => (
                    <Card
                        key={order.id ?? index}
                        elevation={0}
                        sx={{
                            p: 2.5,
                            borderRadius: '28px',
                            border: '1px solid var(--border-color)',
                            bgcolor: 'var(--card-bg)',
                            position: 'relative',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                            '&:active': { transform: 'scale(0.98)' }
                        }}
                    >
                        <Stack direction="row" spacing={2} alignItems="flex-start">
                            <Box sx={{ position: 'relative' }}>
                                <Avatar
                                    variant="rounded"
                                    src={order.image}
                                    sx={{ width: 80, height: 80, borderRadius: '18px', bgcolor: '#F5F5F5' }}
                                />
                                {order.status === 'Pronto' && (
                                    <Box sx={{
                                        position: 'absolute', top: -8, right: -8,
                                        bgcolor: '#2E7D32', color: '#FFF',
                                        borderRadius: '50%', p: 0.5, border: '3px solid #FFF'
                                    }}>
                                        <CheckCircle2 size={16} />
                                    </Box>
                                )}
                            </Box>

                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'var(--text-main)', lineHeight: 1.2 }}>
                                        {order.quantity ?? order.quantidade ?? 1}x {order.name}
                                    </Typography>

                                    {/* REGRA APLICADA: Os três pontinhos SÓ aparecem se o pedido acabou de ser recebido */}
                                    {order.status === 'Recebido' && (
                                        <IconButton size="small" onClick={(e) => handleMenuOpen(e, order)} sx={{ mt: -0.5, mr: -0.5 }}>
                                            <MoreVertical size={18} color="var(--text-muted)" />
                                        </IconButton>
                                    )}
                                </Box>

                                <Typography variant="caption" sx={{ color: 'var(--text-muted)', fontWeight: 600, display: 'block', mb: 1.5 }}>
                                    {new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Pedido #{order.id?.toString().slice(-4)}
                                </Typography>

                                {order.selectedAddons && order.selectedAddons.length > 0 && (
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, mb: 1.5 }}>
                                        {order.selectedAddons.map((addon, i) => (
                                            <Chip
                                                key={i}
                                                label={`+ ${addon.name}`}
                                                size="small"
                                                sx={{
                                                    fontSize: '0.65rem', height: 20,
                                                    bgcolor: '#FAFAFA', border: '1px solid #EEE',
                                                    color: 'var(--text-main)', fontWeight: 800,
                                                    borderRadius: '6px'
                                                }}
                                            />
                                        ))}
                                    </Box>
                                )}

                                {order.observations && (
                                    <Box sx={{
                                        bgcolor: '#F9F9F9', p: 1.5, borderRadius: '12px', mb: 1.5,
                                        borderLeft: '4px solid #DDD'
                                    }}>
                                        <Typography variant="caption" sx={{ color: '#666', fontStyle: 'italic', display: 'block' }}>
                                            "{order.observations}"
                                        </Typography>
                                    </Box>
                                )}

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Chip
                                        icon={statusColors[order.status]?.icon}
                                        label={statusColors[order.status]?.label ?? order.status}
                                        size="small"
                                        sx={{
                                            fontWeight: 900,
                                            fontSize: '0.7rem',
                                            height: 28,
                                            bgcolor: statusColors[order.status]?.bg,
                                            color: statusColors[order.status]?.color,
                                            borderRadius: '10px',
                                            '& .MuiChip-icon': { color: 'inherit' }
                                        }}
                                    />
                                    <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'var(--primary)' }}>
                                        R$ {parseFloat(order.finalPrice ?? order.price ?? 0).toFixed(2)}
                                    </Typography>
                                </Box>
                            </Box>
                        </Stack>
                    </Card>
                ))}
            </Stack>

            {/* Menu atualizado para apenas Cancelar */}
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                PaperProps={{
                    sx: {
                        borderRadius: '18px',
                        mt: 1,
                        minWidth: 180,
                        boxShadow: '0 12px 24px rgba(0,0,0,0.1)',
                        border: '1px solid var(--border-color)'
                    }
                }}
            >
                <Box sx={{ px: 2, py: 1.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Ações do Pedido
                    </Typography>
                </Box>
                <Divider />

                {/* Mostra a opção de cancelar apenas se a cozinha ainda não começou */}
                {selectedOrder?.status === 'Recebido' && (
                    <MuiMenuItem
                        onClick={() => handleStatusChange('Cancelado')}
                        sx={{ py: 1.5, fontWeight: 700, fontSize: '0.9rem', color: '#D32F2F' }}
                    >
                        <XCircle size={18} style={{ marginRight: 8 }} />
                        Cancelar Pedido
                    </MuiMenuItem>
                )}
            </Menu>
        </Box>
    );
};

export default Orders;