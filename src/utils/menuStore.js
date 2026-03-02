import ky from 'ky';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4242';
const API_URL = `${BASE_URL}/api`;

const api = ky.create({
    prefixUrl: API_URL,
    retry: 0
});

export const fetchMenu = async (restaurantSlug) => {
    try {
        const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4242';

        // 🚀 Envie o slug na URL da requisição
        const response = await ky.get(`${BASE_URL}/api/menu?slug=${restaurantSlug}`).json();
        return response;
    } catch (error) {
        console.error('Erro ao buscar o cardápio:', error);
        return [];
    }
};

export const getMenu = async (slug) => {
    try {
        const restaurantSlug = slug || import.meta.env.VITE_RESTAURANT_SLUG || 'vite-gourmet';
        const menu = await ky.get(`${BASE_URL}/api/menu?slug=${restaurantSlug}`, { timeout: 30000 }).json();
        return menu;
    } catch (error) {
        console.error('Error fetching menu:', error);
        return [];
    }
};

export const addMenuItem = async (item) => {
    try {
        const newItem = await api.post('menu', { json: item }).json();
        return newItem;
    } catch (error) {
        console.error('Error adding menu item:', error);
        throw error;
    }
};

export const updateMenuItem = async (item) => {
    try {
        await api.put(`menu/${item.id}`, { json: item });
    } catch (error) {
        console.error('Error updating menu item:', error);
        throw error;
    }
};

export const deleteMenuItem = async (id) => {
    try {
        await api.delete(`menu/${id}`).json();
    } catch (error) {
        console.error('Error deleting menu item:', error);
    }
};
