import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Typography,
    Card,
    Stack,
    TextField,
    Button,
    Avatar,
    Divider,
    List,
    ListItem,
    ListItemText,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Chip,
    IconButton,
    CircularProgress
} from '@mui/material';
import {
    Mail,
    Phone,
    History,
    HelpCircle,
    LogOut,
    ChevronDown,
    Edit2,
    CheckCircle2
} from 'lucide-react';
import { getCurrentUser, logoutUser, saveUser, getOrderHistory } from '../utils/userStore';

const Profile = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({ name: '', email: '', phone: '' });

    useEffect(() => {
        const currentUser = getCurrentUser();

        if (!currentUser) {
            // 🚀 PROTEÇÃO 1: Em vez de redirecionar para um login que pode não existir na hora,
            // criamos um "Usuário Convidado" (Guest) para não quebrar a tela.
            const guestUser = { id: 'guest', name: 'Visitante', email: 'Sem email cadastrado', phone: '' };
            setUser(guestUser);
            setFormData({ name: 'Visitante', email: '', phone: '' });
            setLoadingHistory(false);
        } else {
            setUser(currentUser);
            setFormData({
                name: currentUser.name || '',
                email: currentUser.email || '',
                phone: currentUser.phone || ''
            });

            // Fetch real history
            const fetchHistory = async () => {
                setLoadingHistory(true);
                try {
                    const data = await getOrderHistory(currentUser.id);
                    // 🚀 PROTEÇÃO 2: Garante que o histórico seja SEMPRE uma lista (Array),
                    // evitando o crash do .map() se a API der erro.
                    setHistory(Array.isArray(data) ? data : []);
                } catch (err) {
                    console.error('Erro ao buscar histórico:', err);
                    setHistory([]);
                } finally {
                    setLoadingHistory(false);
                }
            };
            fetchHistory();
        }
    }, [navigate]);

    const handleLogout = () => {
        logoutUser();
        navigate('/auth/login');
    };

    const handleSave = () => {
        const updatedUser = { ...user, ...formData };
        saveUser(updatedUser);
        setUser(updatedUser);
        setIsEditing(false);
    };

    // 🚀 PROTEÇÃO 3: Em vez de "return null" (tela branca), mostramos uma rodinha de loading elegante.
    if (!user) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
                <CircularProgress sx={{ color: 'var(--primary)' }} />
            </Box>
        );
    }

    const faqs = [
        { q: 'Como acompanho meu pedido?', a: 'Você pode ver o status em tempo real na aba "Orders" no menu inferior.' },
        { q: 'Quais as formas de pagamento?', a: 'Aceitamos cartões via Stripe, Pix e pagamento direto no balcão.' },
        { q: 'Como funciona a divisão de conta?', a: 'Na aba "Bill", você pode criar um Pool de Pagamento e compartilhar o QR Code com seus amigos.' },
        { q: 'Posso cancelar um pedido?', a: 'Pedidos podem ser cancelados enquanto o status for "Recebido". Após isso, entre em contato com um garçom.' }
    ];

    return (
        <Box sx={{ pb: 8 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>Meu Perfil</Typography>
                <IconButton onClick={handleLogout} color="error">
                    <LogOut size={24} />
                </IconButton>
            </Box>

            {/* User Info Card */}
            <Card elevation={0} sx={{ p: 3, borderRadius: 4, border: '1px solid #F0F0F0', mb: 4 }}>
                <Stack spacing={3}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar sx={{ width: 64, height: 64, bgcolor: '#FF8C00', fontSize: '1.5rem', fontWeight: 800 }}>
                            {/* 🚀 PROTEÇÃO 4: Fallback caso o nome esteja vazio para não quebrar o Avatar */}
                            {(user.name || 'V').charAt(0).toUpperCase()}
                        </Avatar>
                        <Box sx={{ flexGrow: 1 }}>
                            {isEditing ? (
                                <TextField
                                    fullWidth
                                    variant="standard"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    sx={{ '& input': { fontWeight: 800, fontSize: '1.25rem' } }}
                                />
                            ) : (
                                <Typography variant="h6" sx={{ fontWeight: 800 }}>{user.name}</Typography>
                            )}
                            <Typography variant="body2" color="text.secondary">Cliente</Typography>
                        </Box>
                        <IconButton onClick={() => isEditing ? handleSave() : setIsEditing(true)}>
                            {isEditing ? <CheckCircle2 size={24} color="#2e7d32" /> : <Edit2 size={20} />}
                        </IconButton>
                    </Box>

                    <Divider />

                    <Stack spacing={2}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Mail size={18} color="#757575" />
                            {isEditing ? (
                                <TextField
                                    fullWidth
                                    size="small"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            ) : (
                                <Typography variant="body2">{user.email}</Typography>
                            )}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Phone size={18} color="#757575" />
                            {isEditing ? (
                                <TextField
                                    fullWidth
                                    size="small"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                />
                            ) : (
                                <Typography variant="body2">{user.phone || 'Adicionar telefone'}</Typography>
                            )}
                        </Box>
                    </Stack>
                </Stack>
            </Card>

            {/* History Section */}
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <History size={22} color="#FF8C00" /> Histórico de Visitas
            </Typography>
            <Card elevation={0} sx={{ borderRadius: 4, border: '1px solid #F0F0F0', mb: 4, overflow: 'hidden' }}>
                {loadingHistory ? (
                    <Box sx={{ p: 4, textAlign: 'center' }}>
                        <CircularProgress size={24} sx={{ color: 'var(--primary)' }} />
                    </Box>
                ) : (
                    <List disablePadding>
                        {/* 🚀 PROTEÇÃO 5: Validação do Array antes de tentar renderizar a lista */}
                        {Array.isArray(history) && history.map((session, idx) => (
                            <React.Fragment key={session.id || idx}>
                                <ListItem
                                    button
                                    onClick={() => navigate(`/profile/session/${session.id}`)}
                                    sx={{ py: 2, cursor: 'pointer', '&:hover': { bgcolor: '#FAFAFA' } }}
                                >
                                    <ListItemText
                                        primary={<Typography component="span" sx={{ fontWeight: 700 }}>Mesa {session.table}</Typography>}
                                        secondary={session.date ? new Date(session.date).toLocaleDateString('pt-BR') : 'Data Indisponível'}
                                    />
                                    <Stack alignItems="flex-end" spacing={0.5}>
                                        <Typography sx={{ fontWeight: 800 }}>R$ {parseFloat(session.user_paid || 0).toFixed(2)}</Typography>
                                        <Typography variant="caption" color="text.secondary">Total mesa: R$ {parseFloat(session.session_total || 0).toFixed(2)}</Typography>
                                        <Chip
                                            label={session.status === 'FECHADA' ? 'Finalizada' : 'Em Aberto'}
                                            size="small"
                                            color={session.status === 'FECHADA' ? 'success' : 'warning'}
                                            variant="outlined"
                                            sx={{ fontWeight: 700, height: 20 }}
                                        />
                                    </Stack>
                                </ListItem>
                                {idx < history.length - 1 && <Divider />}
                            </React.Fragment>
                        ))}
                        {history.length === 0 && (
                            <Typography variant="body2" sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                                Nenhuma visita encontrada.
                            </Typography>
                        )}
                    </List>
                )}
            </Card>

            {/* FAQ Section */}
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <HelpCircle size={22} color="#FF8C00" /> FAQ e Ajuda
            </Typography>
            <Box>
                {faqs.map((faq, index) => (
                    <Accordion key={index} elevation={0} sx={{ mb: 1, '&:before': { display: 'none' }, border: '1px solid #F0F0F0', borderRadius: '12px !important', overflow: 'hidden' }}>
                        <AccordionSummary expandIcon={<ChevronDown size={20} />}>
                            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{faq.q}</Typography>
                        </AccordionSummary>
                        <AccordionDetails sx={{ pt: 0 }}>
                            <Typography variant="body2" color="text.secondary">{faq.a}</Typography>
                        </AccordionDetails>
                    </Accordion>
                ))}
            </Box>
        </Box>
    );
};

export default Profile;