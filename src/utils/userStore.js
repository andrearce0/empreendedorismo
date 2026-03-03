const USER_KEY = 'restaurant_user_v1';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4242';
const API_URL = `${BASE_URL}/api`;

export const getCurrentUser = () => {
    const saved = localStorage.getItem(USER_KEY);
    return saved ? JSON.parse(saved) : null;
};

export const saveUser = (user) => {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const getToken = () => {
    return localStorage.getItem('restaurant_token_v1') || localStorage.getItem('token');
};

export const saveAuthData = (user, token) => {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    if (token) {
        localStorage.setItem('restaurant_token_v1', token);
        // Back-compat: outras telas/utils ainda leem a chave "token"
        localStorage.setItem('token', token);
    }
};

export const logoutUser = () => {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('restaurant_token_v1');
    localStorage.removeItem('token');
};

export const registerUser = async (userData) => {
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erro ao criar conta');
        }

        saveAuthData(data.user, data.token);
        return data.user;
    } catch (error) {
        throw error;
    }
};

export const loginUser = async (credentials) => {
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(credentials)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erro ao fazer login');
        }

        saveAuthData(data.user, data.token);
        return data.user;
    } catch (error) {
        throw error;
    }
};

export const getOrderHistory = async (userId) => {
    if (!userId) return [];
    try {
        const response = await fetch(`${API_URL}/user/${userId}/history`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
    } catch (error) {
        console.error('Error fetching history:', error);
        return [];
    }
};

export const fetchSessionDetails = async (sessionId) => {
    try {
        const response = await fetch(`${API_URL}/session/${sessionId}/details`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
    } catch (error) {
        console.error('Error fetching session details:', error);
        throw error;
    }
};
