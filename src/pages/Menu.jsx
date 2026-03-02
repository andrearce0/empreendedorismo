import React, { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, ArrowLeft, ArrowRight, Eye, Camera, Star, Clock, ChefHat, Flame, Leaf } from 'lucide-react';
import { Typography, Stack, Box, Snackbar, Alert, Chip, CircularProgress } from '@mui/material';
import CategoryBar from '../components/CategoryBar';
import MenuItem from '../components/MenuItem';
import ItemDetailsModal from '../components/ItemDetailsModal';
import { addToOrder } from '../utils/orderStore';
import { fetchMenu, fetchCategories } from '../utils/menuStore';
import { getTableSession } from '../utils/tableStore';
import { useParams } from 'react-router-dom';

const Menu = () => {
    const [activeCategory, setActiveCategory] = useState('all');
    const [selectedAllergens, setSelectedAllergens] = useState([]);
    const [openSnackbar, setOpenSnackbar] = useState(false);
    const [menuItems, setMenuItems] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedItemForModal, setSelectedItemForModal] = useState(null);

    const allergensList = ['Glúten', 'Lactose', 'Amendoim', 'Ovos', 'Peixes', 'Soja'];

    const { restaurantSlug } = useParams(); // Puxa o nome do restaurante da URL

    // 🚀 APENAS UM USEEFFECT: Limpo, rápido e focado no restaurante correto.
    useEffect(() => {
        const loadMenuAndCategories = async () => {
            setLoading(true);
            try {
                // Parallel fetch for speed
                const [menuData, categoryData] = await Promise.all([
                    fetchMenu(restaurantSlug),
                    fetchCategories(restaurantSlug)
                ]);

                // Verifica se a API não retornou um erro (ex: array vazio ou objeto de erro)
                if (Array.isArray(menuData)) {
                    setMenuItems(menuData);
                } else {
                    setMenuItems([]);
                }

                if (Array.isArray(categoryData)) {
                    setCategories(categoryData);
                }
            } catch (error) {
                console.error("Erro ao carregar os dados:", error);
            } finally {
                setLoading(false);
            }
        };

        if (restaurantSlug) {
            loadMenuAndCategories();
        }
    }, [restaurantSlug]);

    const handleOpenModal = (item) => {
        setSelectedItemForModal(item);
        setModalOpen(true);
    };

    const handleConfirmAdd = async (item, addons, observations, quantity) => {
        try {
            const tableSession = getTableSession();
            if (!tableSession) {
                alert("Por favor, vincule-se a uma mesa no cabeçalho antes de fazer o pedido.");
                return;
            }
            for (let i = 0; i < quantity; i++) {
                await addToOrder(item, addons, observations, tableSession.sessionId);
            }
            setOpenSnackbar(true);
            setSelectedItemForModal(null);
            setModalOpen(false); // 🚀 Adicionado para fechar o modal corretamente
        } catch (error) {
            console.error('Error adding to order:', error);
            alert(error.message || 'Erro ao adicionar pedido. Tente novamente.');
        }
    };

    const toggleAllergen = (allergen) => {
        setSelectedAllergens(prev =>
            prev.includes(allergen)
                ? prev.filter(a => a !== allergen)
                : [...prev, allergen]
        );
    };

    const getFilteredItems = () => {
        let items = menuItems;

        // Category filter
        if (activeCategory !== 'all') {
            items = items.filter(i => i.categoryId === activeCategory);
        }

        // Allergen EXCLUSION filter
        if (selectedAllergens.length > 0) {
            items = items.filter(item => {
                const itemAllergens = item.allergens || [];
                return !selectedAllergens.some(selected => itemAllergens.includes(selected));
            });
        }

        return items;
    };

    // 🚀 Mostra a rodinha de carregamento enquanto o banco busca os dados
    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                <CircularProgress sx={{ color: 'var(--primary)' }} />
            </Box>
        );
    }

    // 🚀 Mostra uma mensagem amigável se o restaurante não tiver itens
    if (menuItems.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', py: 10, px: 3 }}>
                <ChefHat size={64} color="#CCC" style={{ marginBottom: '16px' }} />
                <Typography variant="h5" sx={{ fontWeight: 900, color: 'var(--text-main)', mb: 1 }}>Cardápio Vazio</Typography>
                <Typography variant="body1" sx={{ color: 'var(--text-muted)' }}>Este restaurante ainda não cadastrou nenhum item.</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ pb: 8 }}>
            <Box sx={{ mb: 4, mt: 1 }}>
                <Typography variant="h4" sx={{ fontWeight: 900, color: 'var(--text-main)', letterSpacing: -1 }}>
                    MENU
                </Typography>
                <Typography variant="body1" sx={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                    O que vamos pedir hoje? 😋
                </Typography>
            </Box>

            <CategoryBar
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
                categories={categories}
            />

            <Box sx={{ mb: 4 }}>
                <Typography variant="caption" sx={{
                    fontWeight: 900, mb: 1.5, display: 'block',
                    color: 'var(--text-main)', letterSpacing: 1.5,
                    textTransform: 'uppercase', fontSize: '0.7rem'
                }}>
                    🚫 Remover alérgenos
                </Typography>
                <Box className="no-scrollbar" sx={{
                    overflowX: 'auto',
                    whiteSpace: 'nowrap',
                    pb: 1,
                    mx: -2,
                    px: 2
                }}>
                    <Stack direction="row" spacing={1.2}>
                        {allergensList.map(allergen => {
                            const active = selectedAllergens.includes(allergen);
                            return (
                                <Chip
                                    key={allergen}
                                    label={allergen}
                                    onClick={() => toggleAllergen(allergen)}
                                    variant={active ? 'filled' : 'outlined'}
                                    sx={{
                                        borderRadius: '10px',
                                        bgcolor: active ? 'var(--secondary)' : 'transparent',
                                        color: active ? 'white' : 'var(--text-muted)',
                                        borderColor: active ? 'var(--secondary)' : 'var(--border-color)',
                                        fontWeight: 800,
                                        fontSize: '0.75rem',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        height: 32,
                                        '&:hover': {
                                            bgcolor: active ? '#333' : '#F0F0F0',
                                            transform: 'translateY(-1px)'
                                        }
                                    }}
                                />
                            );
                        })}
                    </Stack>
                </Box>
            </Box>

            <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr' }, gap: 2 }}>
                {getFilteredItems().map(item => (
                    <MenuItem
                        key={item.id}
                        name={item.name}
                        description={item.description}
                        price={item.price}
                        imageUrl={item.image}
                        allergens={item.allergens}
                        onAdd={() => handleOpenModal(item)}
                    />
                ))}
            </Box>

            <ItemDetailsModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                item={selectedItemForModal}
                onAdd={handleConfirmAdd}
            />

            <Snackbar
                open={openSnackbar}
                autoHideDuration={2000}
                onClose={() => setOpenSnackbar(false)}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert severity="success" sx={{ width: '100%', borderRadius: 3, fontWeight: 700 }}>
                    Item adicionado ao pedido!
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default Menu;