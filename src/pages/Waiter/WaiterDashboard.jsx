import { useState, useEffect } from 'react';
import { Button, Box, Typography, Grid, Card, CardActionArea, CircularProgress, Chip, Stack } from '@mui/material';
import { Users, Receipt, PlayCircle, BellRing, CheckCircle2 } from 'lucide-react';
import ky from 'ky';
import { useNavigate } from 'react-router-dom';
import { acknowledgeWaiter } from '../../utils/tableStore';

const WaiterDashboard = () => {
    const navigate = useNavigate();
    const [tables, setTables] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTablesInfo = async () => {
            try {
                const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4242';
                // 🚀 1. Pegamos o token
                const token = localStorage.getItem('token');

                // 🚀 2. Enviamos no cabeçalho
                const data = await ky.get(`${BASE_URL}/api/waiter/tables`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }).json();

                setTables(data);
            } catch (err) {
                console.error("Error fetching tables for waiter:", err);
                if (err.response && (err.response.status === 401 || err.response.status === 403)) {
                    alert("Sessão expirada. Faça login novamente.");
                }
            } finally {
                setLoading(false);
            }
        };

        fetchTablesInfo();
        const intervalId = setInterval(fetchTablesInfo, 10000);
        return () => clearInterval(intervalId);
    }, []);

    const handleAcknowledge = async (e, tableId) => {
        e.stopPropagation();
        try {
            // Se essa função acknowledgeWaiter faz chamada à API, ela também precisará do token lá dentro do arquivo dela!
            await acknowledgeWaiter(tableId);

            // Refresh list
            const token = localStorage.getItem('token');
            const data = await ky.get(`${import.meta.env.VITE_API_URL || 'http://localhost:4242'}/api/waiter/tables`, {
                headers: {
                    Authorization: `Bearer ${token}` // 🚀 3. Token adicionado no refresh também
                }
            }).json();

            setTables(data);
        } catch (err) {
            console.error("Error acknowledging waiter call:", err);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', mt: 10, justifyContent: 'center' }}><CircularProgress color="warning" /></Box>;

    return (
        <Box>
            <Typography variant="h4" sx={{ fontWeight: 900, mb: 4, color: '#1A1A1A' }}>Gestão de Salão</Typography>

            <Grid container spacing={3}>
                {tables.map(table => {
                    const isOpen = table.status === 'ABERTA';
                    return (
                        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={table.mesa_id}>
                            <Card
                                elevation={isOpen ? 3 : 0}
                                sx={{
                                    borderRadius: 4,
                                    border: isOpen ? '2px solid #FF8C00' : '2px dashed #E5E7EB',
                                    bgcolor: isOpen ? '#FFF' : '#F9FAFB',
                                    transition: 'transform 0.2s',
                                    '&:hover': { transform: 'translateY(-4px)' }
                                }}
                            >
                                <CardActionArea onClick={() => navigate(`/waiter/table/${table.mesa_id}`)} sx={{ p: 2 }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                                        <Typography variant="h5" sx={{ fontWeight: 900 }}>{table.identificador}</Typography>
                                        <Stack direction="row" gap={1}>
                                            {table.chamar_garcom && (
                                                <Chip
                                                    icon={<BellRing size={14} color="#D32F2F" />}
                                                    label="AJUDA!"
                                                    size="small"
                                                    sx={{
                                                        bgcolor: '#FFEBEE',
                                                        color: '#D32F2F',
                                                        fontWeight: 900,
                                                        animation: 'pulse 1.5s infinite',
                                                        border: '1px solid #FFCDD2'
                                                    }}
                                                />
                                            )}
                                            <Chip
                                                label={isOpen ? 'Ocupada' : 'Livre'}
                                                size="small"
                                                sx={{
                                                    fontWeight: 800,
                                                    bgcolor: isOpen ? '#FFF5E6' : '#EFF6FF',
                                                    color: isOpen ? '#FF8C00' : '#3B82F6'
                                                }}
                                            />
                                        </Stack>
                                    </Stack>

                                    <Stack spacing={1}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                                            <Users size={16} />
                                            <Typography variant="body2">Capacidade: {table.capacidade}</Typography>
                                        </Box>
                                        {isOpen && (
                                            <>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                                                    <Receipt size={16} />
                                                    <Typography variant="body2">Pedidos Totais: {table.total_pedidos}</Typography>
                                                </Box>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#2e7d32' }}>
                                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>Total Parcial: R$ {(parseFloat(table.total_conta) || 0).toFixed(2)}</Typography>
                                                </Box>
                                            </>
                                        )}
                                        {!isOpen && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#9CA3AF', mt: 1 }}>
                                                <PlayCircle size={16} />
                                                <Typography variant="body2">Toque para abrir mesa</Typography>
                                            </Box>
                                        )}
                                    </Stack>
                                </CardActionArea>
                                {table.chamar_garcom && (
                                    <Box sx={{ p: 2, pt: 0 }}>
                                        <Button
                                            variant="contained"
                                            color="error"
                                            fullWidth
                                            size="small"
                                            startIcon={<CheckCircle2 size={16} />}
                                            onClick={(e) => handleAcknowledge(e, table.mesa_id)}
                                            sx={{ fontWeight: 800, borderRadius: 2 }}
                                        >
                                            Atender Chamado
                                        </Button>
                                    </Box>
                                )}
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>
        </Box>
    );
};

export default WaiterDashboard;
