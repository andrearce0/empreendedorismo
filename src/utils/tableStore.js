export const TABLE_KEY = 'restaurant_table_session_v1';

export const getTableSession = () => {
    const saved = localStorage.getItem(TABLE_KEY);
    return saved ? JSON.parse(saved) : null;
};

export const saveTableSession = (sessionData) => {
    localStorage.setItem(TABLE_KEY, JSON.stringify(sessionData));
};

export const clearTableSession = () => {
    localStorage.removeItem(TABLE_KEY);
};

export const joinTable = async (tableCode, restaurantSlug) => {
    try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4242';
        const response = await fetch(`${API_URL}/api/session/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tableCode, restaurantSlug })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erro ao entrar na mesa');
        }

        saveTableSession({
            sessionId: data.sessionId,
            tableId: data.tableId,
            tableCode: data.tableCode,
            restaurantSlug: restaurantSlug,
            joinedAt: new Date().toISOString()
        });

        return data;
    } catch (error) {
        throw error;
    }
};
export const callWaiter = async (tableId) => {
    try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4242';
        const response = await fetch(`${API_URL}/api/table/${tableId}/call-waiter`, {
            method: 'POST',
        });
        if (!response.ok) throw new Error('Erro ao chamar garçom');
        return await response.json();
    } catch (error) {
        throw error;
    }
};

export const acknowledgeWaiter = async (tableId) => {
    try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4242';
        const response = await fetch(`${API_URL}/api/table/${tableId}/acknowledge-waiter`, {
            method: 'POST',
        });
        if (!response.ok) throw new Error('Erro ao atender garçom');
        return await response.json();
    } catch (error) {
        throw error;
    }
};
