import React from 'react';
import { Box, Stack, Typography } from '@mui/material';

const CategoryBar = ({ activeCategory, onCategoryChange, categories = [] }) => {
    // Add "All" category at the beginning
    const allCategories = [
        { id: 'all', name: 'Todos', emoji: '🍽️' },
        ...categories
    ];

    return (
        <Box
            className="no-scrollbar"
            sx={{
                overflowX: 'auto',
                whiteSpace: 'nowrap',
                mb: { xs: 3, md: 4 },
                py: 1,
                userSelect: 'none',
                mx: -2, // Bleed out to container edges
                px: 2,
            }}
        >
            <Stack direction="row" spacing={1.5}>
                {allCategories.map((cat) => {
                    const isActive = activeCategory === cat.id;
                    return (
                        <Box
                            key={cat.id}
                            onClick={() => onCategoryChange(cat.id)}
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 1,
                                px: 2.5,
                                py: 1.2,
                                borderRadius: '14px',
                                cursor: 'pointer',
                                fontWeight: 800,
                                fontSize: '0.9rem',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                bgcolor: isActive ? 'var(--primary)' : 'var(--card-bg)',
                                color: isActive ? '#FFFFFF' : 'var(--text-muted)',
                                border: '1px solid',
                                borderColor: isActive ? 'var(--primary)' : 'var(--border-color)',
                                boxShadow: isActive ? '0 8px 16px rgba(255,140,0,0.25)' : 'none',
                                transform: isActive ? 'scale(1.05)' : 'scale(1)',
                                '&:hover': {
                                    bgcolor: isActive ? 'var(--primary-hover)' : '#EEEEEE',
                                    transform: isActive ? 'scale(1.05)' : 'translateY(-2px)',
                                }
                            }}
                        >
                            <span style={{ fontSize: '1.2rem' }}>{cat.emoji}</span>
                            <Typography sx={{ fontWeight: 800, fontSize: 'inherit' }}>{cat.name}</Typography>
                        </Box>
                    );
                })}
            </Stack>
        </Box>
    );
};

export default CategoryBar;
