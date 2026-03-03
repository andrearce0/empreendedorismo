import { Box, Card, Typography, Stack, Button, Container } from '@mui/material';
import { ChefHat, Settings, ArrowLeft, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AdminPortal = () => {
    const navigate = useNavigate();

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#F8F9FA', py: 8 }}>
            <Container maxWidth="sm">
                <Typography variant="h4" align="center" sx={{ fontWeight: 900, mb: 6, color: '#1A1A1A' }}>
                    Portal Administrativo
                </Typography>

                <Stack spacing={3}>
                    {/* Botão Direto para o Gerenciamento */}
                    <Card
                        onClick={() => navigate('/admin/management')}
                        sx={{
                            p: 4,
                            borderRadius: 4,
                            cursor: 'pointer',
                            transition: '0.3s',
                            '&:hover': { transform: 'translateY(-5px)', boxShadow: 6, borderColor: '#FF8C00' },
                            border: '2px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3
                        }}
                    >
                        <Box sx={{ bgcolor: '#FFF5E6', p: 2, borderRadius: 3 }}>
                            <Settings size={40} color="#FF8C00" />
                        </Box>
                        <Box>
                            <Typography variant="h6" sx={{ fontWeight: 800 }}>Gerenciamento</Typography>
                            <Typography variant="body2" color="text.secondary">Controle de cardápio, KPIs e relatórios</Typography>
                        </Box>
                    </Card>

                    {/* Botão Direto para a Cozinha */}
                    <Card
                        onClick={() => navigate('/admin/kitchen')}
                        sx={{
                            p: 4,
                            borderRadius: 4,
                            cursor: 'pointer',
                            transition: '0.3s',
                            '&:hover': { transform: 'translateY(-5px)', boxShadow: 6, borderColor: '#1A1A1A' },
                            border: '2px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3
                        }}
                    >
                        <Box sx={{ bgcolor: '#F0F0F0', p: 2, borderRadius: 3 }}>
                            <ChefHat size={40} color="#1A1A1A" />
                        </Box>
                        <Box>
                            <Typography variant="h6" sx={{ fontWeight: 800 }}>Cozinha</Typography>
                            <Typography variant="body2" color="text.secondary">Painel Kanban de pedidos em tempo real</Typography>
                        </Box>
                    </Card>

                    {/* Botão Direto para o Garçom */}
                    <Card
                        onClick={() => navigate('/waiter')}
                        sx={{
                            p: 4,
                            borderRadius: 4,
                            cursor: 'pointer',
                            transition: '0.3s',
                            '&:hover': { transform: 'translateY(-5px)', boxShadow: 6, borderColor: '#0288D1' },
                            border: '2px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3
                        }}
                    >
                        <Box sx={{ bgcolor: '#E1F5FE', p: 2, borderRadius: 3 }}>
                            <Users size={40} color="#0288D1" />
                        </Box>
                        <Box>
                            <Typography variant="h6" sx={{ fontWeight: 800 }}>Garçom</Typography>
                            <Typography variant="body2" color="text.secondary">Painel de atendimento e mesas</Typography>
                        </Box>
                    </Card>

                    {/* Voltar para o Site Normal */}
                    <Button
                        startIcon={<ArrowLeft />}
                        onClick={() => navigate('/menu')}
                        sx={{ color: '#757575', fontWeight: 700 }}
                    >
                        Voltar ao Menu Principal
                    </Button>
                </Stack>
            </Container>
        </Box>
    );
};

export default AdminPortal;