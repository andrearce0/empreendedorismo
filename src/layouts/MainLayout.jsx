import React from 'react';
import {
    Box,
    AppBar,
    Toolbar,
    Typography,
    Container,
    BottomNavigation,
    BottomNavigationAction,
    Paper
} from '@mui/material';
import { Outlet, useNavigate, useLocation, useParams } from 'react-router-dom';
import {
    UtensilsCrossed,
    ShoppingBag,
    Receipt,
    UserCircle,
    ScanLine,
    LogOut,
    BellRing
} from 'lucide-react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    IconButton,
    Snackbar,
    Alert
} from '@mui/material';
import { getTableSession, joinTable, clearTableSession, callWaiter } from '../utils/tableStore';

const MainLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { restaurantSlug, tableId } = useParams();

    const basePath = `/${restaurantSlug || 'demo'}${tableId ? `/${tableId}` : ''}`;

    const navItems = [
        { label: 'Menu', icon: <UtensilsCrossed size={20} />, path: `${basePath}/menu` },
        { label: 'Orders', icon: <ShoppingBag size={20} />, path: `${basePath}/orders` },
        { label: 'Bill', icon: <Receipt size={20} />, path: `${basePath}/bill` },
        { label: 'Profile', icon: <UserCircle size={20} />, path: `${basePath}/profile` },
    ];

    const currentPath = location.pathname;
    const activeValue = navItems.findIndex(item => item.path === currentPath);

    const [tableSession, setTableSession] = React.useState(null);
    const [openModal, setOpenModal] = React.useState(false);
    const [tableCode, setTableCode] = React.useState('');
    const [errorMsg, setErrorMsg] = React.useState('');
    const [callingWaiter, setCallingWaiter] = React.useState(false);
    const [callSuccess, setCallSuccess] = React.useState(false);

    React.useEffect(() => {
        const checkSession = async () => {
            let session = getTableSession();

            // Auto-join if URL has tableId but local storage doesn't match
            if (tableId && (!session || session.tableCode !== tableId.toUpperCase())) {
                try {
                    session = await joinTable(tableId.toUpperCase(), restaurantSlug);
                } catch (e) {
                    console.error("Auto-join failed via URL", e);
                }
            }
            setTableSession(session);
        };
        checkSession();
    }, [tableId]);

    const handleJoinTable = async () => {
        try {
            setErrorMsg('');
            if (!tableCode.trim()) {
                setErrorMsg('Digite um código válido.');
                return;
            }
            const sessionData = await joinTable(tableCode.trim().toUpperCase(), restaurantSlug);
            setTableSession(sessionData);
            setOpenModal(false);
            setTableCode('');
            // Ensure URL updates to include tableId
            if (restaurantSlug) {
                navigate(`/${restaurantSlug}/${sessionData.tableCode}/menu`);
            }
        } catch (e) {
            setErrorMsg(e.message || 'Erro ao entrar na mesa.');
        }
    };

    const handleLeaveTable = () => {
        clearTableSession();
        setTableSession(null);
        if (restaurantSlug) {
            navigate(`/${restaurantSlug}/menu`);
        } else {
            navigate('/');
        }
    };

    const handleCallWaiter = async () => {
        if (!tableSession) return;
        setCallingWaiter(true);
        try {
            await callWaiter(tableSession.tableId);
            setCallSuccess(true);
        } catch (e) {
            console.error(e);
        } finally {
            setCallingWaiter(false);
        }
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
                <Toolbar sx={{ justifyContent: 'space-between', height: 70 }}>
                    <Typography
                        variant="h6"
                        component="div"
                        sx={{
                            fontWeight: 900,
                            color: 'var(--text-main)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                            letterSpacing: -0.5
                        }}
                        onClick={() => navigate('/')}
                    >
                        {restaurantSlug ? restaurantSlug.toUpperCase() : (
                            <Box component="span" sx={{ display: 'flex', alignItems: 'center' }}>
                                <span style={{ color: 'var(--primary)' }}>u</span>table
                            </Box>
                        )}
                    </Typography>

                    {tableSession ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<BellRing size={16} />}
                                onClick={handleCallWaiter}
                                disabled={callingWaiter}
                                sx={{
                                    borderRadius: '12px',
                                    fontWeight: 800,
                                    color: 'var(--primary)',
                                    borderColor: 'var(--primary)',
                                    '&:hover': { bgcolor: '#FFF5E6', borderColor: 'var(--primary-hover)' }
                                }}
                            >
                                {callingWaiter ? 'Chamando...' : 'Garçom'}
                            </Button>
                            <Box sx={{
                                bgcolor: '#FFF5E6',
                                px: 2,
                                py: 0.7,
                                borderRadius: '12px',
                                border: '1px solid #FFE0B2',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1
                            }}>
                                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'var(--primary)', animation: 'pulse 2s infinite' }} />
                                <Typography variant="caption" sx={{ fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Mesa {tableSession.tableCode}
                                </Typography>
                            </Box>
                            <IconButton
                                size="small"
                                onClick={handleLeaveTable}
                                sx={{ color: '#FF5252', bgcolor: '#FFF0F0', '&:hover': { bgcolor: '#FFDADA' } }}
                            >
                                <LogOut size={18} />
                            </IconButton>
                        </Box>
                    ) : (
                        <Button
                            variant="contained"
                            size="small"
                            disableElevation
                            startIcon={<ScanLine size={16} />}
                            onClick={() => setOpenModal(true)}
                            sx={{
                                bgcolor: 'var(--primary)',
                                color: '#FFFFFF',
                                fontWeight: 800,
                                borderRadius: '12px',
                                px: 2,
                                py: 1,
                                '&:hover': { bgcolor: 'var(--primary-hover)' }
                            }}
                        >
                            Mesa
                        </Button>
                    )}
                </Toolbar>
            </AppBar>

            {/* Modal de Mesa */}
            <Dialog
                open={openModal}
                onClose={() => setOpenModal(false)}
                maxWidth="xs"
                fullWidth
                PaperProps={{
                    sx: {
                        borderRadius: '24px',
                        p: 1
                    }
                }}
            >
                <DialogTitle sx={{ fontWeight: 900, textAlign: 'center', pt: 3, fontSize: '1.5rem' }}>
                    Sua Mesa
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ textAlign: 'center', mb: 3 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                            Identifique-se informando o código da sua mesa.
                        </Typography>
                    </Box>
                    <TextField
                        autoFocus
                        margin="dense"
                        placeholder="Ex: MESA-01"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={tableCode}
                        onChange={(e) => setTableCode(e.target.value)}
                        error={!!errorMsg}
                        helperText={errorMsg}
                        InputProps={{
                            sx: { borderRadius: '16px', fontWeight: 700 }
                        }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 3, pt: 1, flexDirection: 'column', gap: 1 }}>
                    <Button
                        onClick={handleJoinTable}
                        variant="contained"
                        fullWidth
                        sx={{
                            bgcolor: 'var(--primary)',
                            fontWeight: 800,
                            borderRadius: '16px',
                            py: 1.5,
                            fontSize: '1rem',
                            '&:hover': { bgcolor: 'var(--primary-hover)' }
                        }}
                    >
                        Confirmar
                    </Button>
                    <Button
                        variant="outlined"
                        fullWidth
                        startIcon={<ScanLine size={18} />}
                        sx={{
                            borderRadius: '16px',
                            py: 1.5,
                            fontWeight: 800,
                            borderColor: '#DDD',
                            color: '#666'
                        }}
                        onClick={() => alert('Para ler o QR Code, aponte sua câmera para o código na mesa.\n(Funcionalidade integrada ao navegador)')}
                    >
                        Ler QR Code
                    </Button>
                    <Button onClick={() => setOpenModal(false)} color="inherit" fullWidth sx={{ fontWeight: 700 }}>
                        Cancelar
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={callSuccess}
                autoHideDuration={4000}
                onClose={() => setCallSuccess(false)}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert severity="success" sx={{ borderRadius: 3, fontWeight: 700 }}>
                    Garçom chamado! Em breve alguém virá atendê-lo.
                </Alert>
            </Snackbar>

            {/* Main Content */}
            <Container component="main" maxWidth="md" sx={{ flexGrow: 1, py: { xs: 3, md: 5 }, pb: 12 }}>
                <Outlet />
            </Container>

            {/* Footer Navigation */}
            <Paper
                sx={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    bgcolor: 'transparent',
                    display: 'flex',
                    justifyContent: 'center',
                    pb: 2,
                    px: 2,
                    pointerEvents: 'none'
                }}
                elevation={0}
            >
                <BottomNavigation
                    showLabels
                    value={activeValue >= 0 ? activeValue : 0}
                    onChange={(event, newValue) => {
                        navigate(navItems[newValue].path);
                    }}
                    sx={{
                        height: 75,
                        width: '100%',
                        maxWidth: 500,
                        borderRadius: '24px',
                        bgcolor: 'rgba(26, 26, 26, 0.95)',
                        backdropFilter: 'blur(10px)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
                        pointerEvents: 'auto',
                        '& .MuiBottomNavigationAction-root': {
                            color: 'rgba(255, 255, 255, 0.5)',
                            transition: 'all 0.2s',
                            minWidth: 'auto'
                        },
                        '& .Mui-selected': {
                            color: 'var(--primary) !important',
                            '& .MuiBottomNavigationAction-label': {
                                fontWeight: 800,
                                fontSize: '0.75rem'
                            },
                        }
                    }}
                >
                    {navItems.map((item) => (
                        <BottomNavigationAction
                            key={item.label}
                            label={item.label}
                            icon={item.icon}
                        />
                    ))}
                </BottomNavigation>
            </Paper>

            <style>
                {`
                    @keyframes pulse {
                        0% { transform: scale(0.95); opacity: 0.5; }
                        50% { transform: scale(1.05); opacity: 1; }
                        100% { transform: scale(0.95); opacity: 0.5; }
                    }
                `}
            </style>
        </Box>

    );
};

export default MainLayout;
