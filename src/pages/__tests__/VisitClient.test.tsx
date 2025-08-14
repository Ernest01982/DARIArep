import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { VisitClient } from '../VisitClient';
import { offlineStorage } from '../../services/offline';
import { vi } from 'vitest';

vi.mock('../../services/offline', () => ({
  offlineStorage: {
    getActiveVisit: vi.fn().mockResolvedValue({ visit_id: 'visit-1', client_id: 'client-1', start_time: 'time' }),
    getClients: vi.fn().mockResolvedValue([{ id: 'client-1', name: 'Test Client' }]),
    getVisits: vi.fn().mockResolvedValue([]),
    getClientProducts: vi.fn().mockResolvedValue([]),
    getProducts: vi.fn().mockResolvedValue([]),
    getOrders: vi.fn().mockResolvedValue([]),
    setActiveVisit: vi.fn().mockResolvedValue(undefined)
  },
  enqueueMutation: vi.fn()
}));

vi.mock('../../services/sync', () => ({
  isNetworkOnline: vi.fn(() => true),
  withOfflineFallback: vi.fn(async (_online, offline) => offline())
}));

const updateMock = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }));
vi.mock('../../services/supabase', () => ({
  supabase: { from: vi.fn(() => ({ update: updateMock })) }
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual: any = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('VisitClient', () => {
  it('ends visit and navigates to visit start', async () => {
    render(
      <MemoryRouter initialEntries={['/visit/client?visit_id=visit-1&client_id=client-1']}>
        <Routes>
          <Route path="/visit/client" element={<VisitClient />} />
        </Routes>
      </MemoryRouter>
    );

    const endButton = await screen.findByRole('button', { name: /end visit/i });
    await waitFor(() => expect(endButton).toBeEnabled());

    await userEvent.click(endButton);

    await waitFor(() => {
      expect(offlineStorage.setActiveVisit).toHaveBeenCalledWith(null);
      expect(mockNavigate).toHaveBeenCalledWith('/visit');
    });
  });
});
