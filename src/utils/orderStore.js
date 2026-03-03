import ky from 'ky';
import { getToken } from './userStore';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4242';
const API_URL = `${BASE_URL}/api`;

const api = ky.create({
    prefixUrl: API_URL,
    retry: 0
});

// --- Orders Logic ---
export const getOrders = async (sessionId) => {
    if (!sessionId) return [];
    try {
        const orders = await api.get(`orders/${sessionId}`).json();
        return orders;
    } catch (error) {
        console.error('Error fetching orders:', error);
        return [];
    }
};

export const getKitchenOrders = async () => {
    try {
        const token = getToken();
        const orders = await api.get('admin/kitchen/orders', {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        }).json();
        return orders;
    } catch (error) {
        console.error('Error fetching kitchen orders:', error);
        return [];
    }
};

export const addToOrder = async (item, selectedAddons = [], observations = '', sessionId) => {
    if (!sessionId) throw new Error("Mesa não identificada");
    try {
        await api.post('orders', {
            json: { item, selectedAddons, observations, sessionId }
        }).json();
    } catch (error) {
        console.error('Error adding to order:', error);
        throw error;
    }
};

export const updateOrderStatus = async (orderId, newStatus, sessionId = null) => {
    try {
        const token = getToken();
        await api.patch(`orders/${orderId}/status`, {
            // Enviamos o sessionId junto com o status
            json: { status: newStatus, sessionId },
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        }).json();
    } catch (error) {
        console.error('Error updating order status:', error);
    }
};

export const clearOrders = () => { };

// --- Pools Logic ---

/**
 * Busca a pool PENDENTE ativa de uma sessão (retorna null se não houver)
 */
export const getPoolBySession = async (sessionId) => {
    try {
        const response = await api.get(`pool/session/${sessionId}`).json();
        return response.pool;
    } catch (error) {
        console.error('Error fetching pool for session:', error);
        return null;
    }
};

/**
 * Lista TODAS as pools de uma sessão (abertas + fechadas/pagas)
 */
export const getAllPools = async (sessionId) => {
    try {
        const response = await api.get(`pool/session/${sessionId}/all`).json();
        return response.pools || [];
    } catch (error) {
        console.error('Error fetching all pools for session:', error);
        return [];
    }
};

/**
 * Cria uma nova pool (ou retorna a existente se já houver PENDENTE).
 * Aceita orderItemIds para vincular itens automaticamente.
 */
export const createPool = async (totalAmount, baseAmount, sessionId, orderItemIds = []) => {
    if (!sessionId) throw new Error("Mesa não identificada");
    try {
        const response = await api.post('pool/create', {
            json: { totalAmount, baseAmount, sessionId, orderItemIds }
        }).json();
        return response.pool;
    } catch (error) {
        console.error('Error creating pool:', error);
        throw error;
    }
};

/**
 * Busca os detalhes de uma pool por ID (para a página Pool.jsx)
 */
export const getPool = async (poolId) => {
    try {
        const response = await api.get(`pool/${poolId}`).json();
        return response;
    } catch (error) {
        console.error('Error fetching pool:', error);
        return null;
    }
};

/**
 * Remove um item de uma pool PENDENTE e recalcula o total
 */
export const removePoolItem = async (poolId, orderItemId) => {
    try {
        const response = await api.delete(`pool/${poolId}/item/${orderItemId}`).json();
        return response;
    } catch (error) {
        console.error('Error removing item from pool:', error);
        throw error;
    }
};

/**
 * Inicia o checkout Stripe para contribuição na pool
 */
export const startPoolCheckout = async ({ poolId, amount, contributorName, itemName, userId, type, restaurantSlug, tableId }) => {
    try {
        const response = await api.post('pool/checkout', {
            json: {
                poolId,
                amount,
                contributorName,
                itemName: itemName || `Contribuição Mesa - ${contributorName}`,
                userId,
                type,
                restaurantSlug,
                tableId
            }
        }).json();
        return response;
    } catch (error) {
        console.error('Error starting checkout:', error);
        throw error;
    }
};
