import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
    Box,
    AppBar,
    Toolbar,
    Typography,
    Button,
    IconButton,
    Stack,
    Tooltip,
    Container
} from '@mui/material';
import {
    LayoutDashboard,
    LogOut,
    Settings,
    UserCircle,
    Store
} from 'lucide-react';
import { getCurrentUser, logoutUser } from '../utils/userStore';

const WaiterLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const user = getCurrentUser();

    const handleLogout = () => {
        logoutUser();
        navigate('/menu');
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'var(--bg-color)' }}>
            {/* Header */}
            <AppBar
                position="sticky"
                elevation={0}
                sx={{
                    bgcolor: 'rgba(255, 255, 255, 0.8)',
                    backdropFilter: 'blur(10px)',
                    borderBottom: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    zIndex: 1100
                }}
            >
                <Container maxWidth="lg">
                    <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 0, sm: 2 } }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Box
                                sx={{
                                    bgcolor: 'var(--primary)',
                                    p: 1,
                                    borderRadius: 2,
                                    display: { xs: 'none', sm: 'flex' }
                                }}
                            >
                                <Store color="white" size={20} />
                            </Box>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>
                                    Garçom
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                    Terminal Ativo
                                </Typography>
                            </Box>
                        </Stack>

                        <Stack direction="row" spacing={{ xs: 0.5, sm: 1 }} alignItems="center">
                            <Button
                                size="small"
                                startIcon={<LayoutDashboard size={18} />}
                                onClick={() => navigate('/waiter')}
                                sx={{
                                    borderRadius: 3,
                                    fontWeight: 800,
                                    px: 2,
                                    bgcolor: location.pathname === '/waiter' ? 'rgba(255, 140, 0, 0.1)' : 'transparent',
                                    color: location.pathname === '/waiter' ? 'var(--primary)' : 'inherit',
                                    '&:hover': { bgcolor: 'rgba(255, 140, 0, 0.15)' }
                                }}
                            >
                                <Box sx={{ display: { xs: 'none', md: 'block' } }}>Mesas</Box>
                            </Button>

                            {user?.role === 'ADMIN' && (
                                <Button
                                    size="small"
                                    startIcon={<Settings size={18} />}
                                    onClick={() => navigate('/admin')}
                                    sx={{
                                        borderRadius: 3,
                                        fontWeight: 800,
                                        px: 2,
                                        color: 'inherit',
                                        '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.05)' }
                                    }}
                                >
                                    <Box sx={{ display: { xs: 'none', md: 'block' } }}>Admin</Box>
                                </Button>
                            )}

                            <Box sx={{ width: '1px', height: '24px', bgcolor: 'var(--border-color)', mx: 1 }} />

                            <Tooltip title="Sair do Terminal">
                                <IconButton
                                    onClick={handleLogout}
                                    sx={{
                                        color: '#F87171',
                                        bgcolor: '#FEF2F2',
                                        '&:hover': { bgcolor: '#FEE2E2' },
                                        borderRadius: 3
                                    }}
                                >
                                    <LogOut size={20} />
                                </IconButton>
                            </Tooltip>
                        </Stack>
                    </Toolbar>
                </Container>
            </AppBar>

            {/* Main Content */}
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: { xs: 2, md: 4 },
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                <Container maxWidth="lg" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <Box
                        sx={{
                            flexGrow: 1,
                            animation: 'fadeInUp 0.4s ease-out'
                        }}
                    >
                        <Outlet />
                    </Box>
                </Container>
            </Box>
        </Box>
    );
};

export default WaiterLayout;
