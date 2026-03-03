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

export const fetchAdminMenu = async () => {
    try {
        const token = localStorage.getItem('token');
        const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4242';

        const response = await ky.get(`${BASE_URL}/api/admin/menu`, {
            headers: { Authorization: `Bearer ${token}` }
        }).json();
        return response;
    } catch (error) {
        console.error('Erro ao buscar cardápio administrativo:', error);
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
        const token = localStorage.getItem('token'); // 🚀 PEGA O CRACHÁ DO ADMIN
        const newItem = await api.post('menu', {
            json: item,
            headers: { Authorization: `Bearer ${token}` } // 🚀 ENVIA PARA O BACK-END
        }).json();
        return newItem;
    } catch (error) {
        console.error('Error adding menu item:', error);
        throw error;
    }
};

export const updateMenuItem = async (item) => {
    try {
        const token = localStorage.getItem('token');
        await api.put(`menu/${item.id}`, {
            json: item,
            headers: { Authorization: `Bearer ${token}` }
        });
    } catch (error) {
        console.error('Error updating menu item:', error);
        throw error;
    }
};

export const deleteMenuItem = async (id) => {
    try {
        const token = localStorage.getItem('token');
        await api.delete(`menu/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        }).json();
    } catch (error) {
        console.error('Error deleting menu item:', error);
    }
};

// --- CATEGORIES ---

export const fetchCategories = async (slug) => {
    try {
        const restaurantSlug = slug || import.meta.env.VITE_RESTAURANT_SLUG || 'vite-gourmet';
        const response = await ky.get(`${BASE_URL}/api/categories?slug=${restaurantSlug}`).json();
        return response;
    } catch (error) {
        console.error('Erro ao buscar categorias:', error);
        return [];
    }
};

export const fetchAdminCategories = async () => {
    try {
        const token = localStorage.getItem('token');
        const response = await ky.get(`${BASE_URL}/api/admin/categories`, {
            headers: { Authorization: `Bearer ${token}` }
        }).json();
        return response;
    } catch (error) {
        console.error('Erro ao buscar categorias administrativas:', error);
        return [];
    }
};

export const addCategory = async (category) => {
    try {
        const token = localStorage.getItem('token');
        const response = await api.post('categories', {
            json: category,
            headers: { Authorization: `Bearer ${token}` }
        }).json();
        return response;
    } catch (error) {
        console.error('Error adding category:', error);
        throw error;
    }
};

export const updateCategory = async (id, category) => {
    try {
        const token = localStorage.getItem('token');
        await api.put(`categories/${id}`, {
            json: category,
            headers: { Authorization: `Bearer ${token}` }
        });
    } catch (error) {
        console.error('Error updating category:', error);
        throw error;
    }
};

export const deleteCategory = async (id) => {
    try {
        const token = localStorage.getItem('token');
        await api.delete(`categories/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
    } catch (error) {
        console.error('Error deleting category:', error);
        throw error;
    }
};
