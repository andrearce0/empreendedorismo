import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { getCurrentUser } from './utils/userStore'; // Importe a função que pega o usuário

import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import UtableHub from './pages/UtableHub';
import Menu from './pages/Menu';
import Orders from './pages/Orders';
import Bill from './pages/Bill';
import Pool from './pages/Pool';
import Profile from './pages/Profile';
import SessionDetail from './pages/SessionDetail';
import Success from './pages/Success';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import AdminPortal from './pages/Admin/AdminPortal';
import Management from './pages/Admin/Management';
import Kitchen from './pages/Admin/Kitchen';
import WaiterLayout from './layouts/WaiterLayout';
import WaiterDashboard from './pages/Waiter/WaiterDashboard';
import WaiterTableManager from './pages/Waiter/WaiterTableManager';

// Future pages (placeholder)
const PlaceholderPage = ({ title }) => (
    <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2 style={{ color: '#FF8C00' }}>{title}</h2>
        <p>This page is under construction.</p>
    </div>
);

const theme = createTheme({
    palette: {
        primary: {
            main: '#FF8C00', // Orange
            contrastText: '#FFFFFF',
        },
        background: {
            default: '#FFFFFF',
            paper: '#FFFFFF',
        },
        text: {
            primary: '#1A1A1A',
            secondary: '#757575',
        },
    },
    typography: {
        fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
        h5: {
            fontWeight: 900,
        },
        h6: {
            fontWeight: 700,
        },
    },
    shape: {
        borderRadius: 16,
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 12,
                    textTransform: 'none',
                    fontWeight: 700,
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                },
            },
        },
    },
});



// ... theme ...

const AdminRoute = () => {
    const user = getCurrentUser();

    // Se não estiver logado, chuta para a tela de login
    if (!user) {
        return <Navigate to="/auth/login" replace />;
    }

    // Se estiver logado, mas for apenas um CLIENTE, manda de volta pro hub
    if (user.role !== 'ADMIN' && user.role !== 'COZINHA') {
        return <Navigate to="/" replace />;
    }

    // Se passou nas verificações, libera a catraca!
    return <Outlet />;
};

const WaiterRoute = () => {
    const user = getCurrentUser();

    // 1. Se não estiver logado, manda para o login
    if (!user) {
        return <Navigate to="/auth/login" replace />;
    }

    // 2. Se for um CLIENTE comum, expulsa para o hub
    if (user.role !== 'GARCOM' && user.role !== 'ADMIN') {
        return <Navigate to="/" replace />;
    }

    // 3. Se passou, libera o acesso ao terminal!
    return <Outlet />;
};

function App() {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <BrowserRouter>
                <Routes>
                    {/* Utable Hub / Entry Point */}
                    <Route path="/" element={<UtableHub />} />
                    <Route path="/profile" element={<Profile />} />

                    {/* Restaurant Routes: requires slug -> /burger-king/MESA-01/menu */}
                    <Route path="/:restaurantSlug" element={<MainLayout />}>
                        <Route index element={<Navigate to="menu" replace />} />
                        <Route path="menu" element={<Menu />} />
                        <Route path="orders" element={<Orders />} />
                        <Route path="bill" element={<Bill />} />
                        <Route path="pool/:poolId" element={<Pool />} />
                        {/* Option with Table ID included */}
                        <Route path=":tableId/menu" element={<Menu />} />
                        <Route path=":tableId/orders" element={<Orders />} />
                        <Route path=":tableId/bill" element={<Bill />} />
                        <Route path=":tableId/pool/:poolId" element={<Pool />} />

                        <Route path=":tableId/profile" element={<Profile />} />
                        <Route path=":tableId/profile/session/:sessionId" element={<SessionDetail />} />

                        <Route path="profile" element={<Profile />} />
                        <Route path="profile/session/:sessionId" element={<SessionDetail />} />
                    </Route>



                    {/* Global Routes */}
                    <Route path="/success" element={<Success />} />

                    <Route path="/auth" element={<AuthLayout />}>
                        <Route path="login" element={<Login />} />
                        <Route path="register" element={<Register />} />
                    </Route>

                    <Route path="admin" element={<AdminRoute />}>
                        <Route index element={<AdminPortal />} />
                        <Route path="management" element={<Management />} />
                        <Route path="kitchen" element={<Kitchen />} />
                    </Route>

                    <Route path="waiter" element={<WaiterRoute />}>
                        <Route element={<WaiterLayout />}>
                            <Route index element={<WaiterDashboard />} />
                            <Route path="table/:tableId" element={<WaiterTableManager />} />
                        </Route>
                    </Route>
                </Routes>
            </BrowserRouter>
        </ThemeProvider>
    );
}

export default App;