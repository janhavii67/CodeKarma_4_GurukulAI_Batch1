import { describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/api/client', () => ({ api: apiMock }));

import { fetchAllMachines } from '../features/knowledge-capture/knowledgeApi';

describe('registered equipment API pagination', () => {
  it('loads all database pages and preserves real machine IDs without duplicates', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `machine-${index + 1}`,
      name: `Machine ${index + 1}`,
    }));
    const secondPage = Array.from({ length: 50 }, (_, index) => ({
      id: `machine-${index + 101}`,
      name: `Machine ${index + 101}`,
    }));
    apiMock.get.mockImplementation((path: string) => {
      if (path === '/machines?page=1&page_size=100') {
        return Promise.resolve({ items: firstPage, total: 150, page: 1, page_size: 100 });
      }
      if (path === '/machines?page=2&page_size=100') {
        return Promise.resolve({ items: secondPage, total: 150, page: 2, page_size: 100 });
      }
      return Promise.reject(new Error(`Unexpected machine request: ${path}`));
    });

    const catalog = await fetchAllMachines();

    expect(apiMock.get).toHaveBeenCalledTimes(2);
    expect(catalog.total).toBe(150);
    expect(catalog.items).toHaveLength(150);
    expect(new Set(catalog.items.map(machine => machine.id)).size).toBe(150);
    expect(catalog.items[149].id).toBe('machine-150');
  });
});
