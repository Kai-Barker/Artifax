import orderApi, {
  deleteOrder,
  getActiveAndQueuedJobs,
  getCraftingJobs,
  getCraftingQueue,
  getOrders,
  getUsers,
  updateOrderStatus,
} from '../orderApi';
import { httpError, mockedAxios, mockGet, mockWritesSucceed, networkError } from '../../test-utils/http';
import { ordersFixture, usersFixture } from '../../test-utils/fixtures';

// Legacy order shape this service was written against (orderItems + orderDateTime).
const legacyOrders = [
  { orderID: 3, orderDateTime: '2026-11-01T10:00:00Z', status: 'queued', totalTime: 30, timeElapsed: 0, employeeID: 2, orderItems: [{ itemName: 'Control Panel', quantity: 2 }] },
  { orderID: 1, orderDateTime: '2026-11-01T08:00:00Z', status: 'Active', totalTime: 60, timeElapsed: 30, employeeID: 1, orderItems: [{ itemName: 'Gear Box', quantity: 1 }, { itemName: 'Bolt', quantity: 3 }] },
  { orderID: 2, orderDateTime: '2026-11-01T09:00:00Z', status: 'Paused', employeeID: 99, orderItems: [] },
  { orderID: 4, orderDateTime: '2026-11-01T07:00:00Z', status: 'Complete', orderItems: [{ itemName: 'Done', quantity: 1 }] },
];

describe('orderApi', () => {
  it('fetches orders and users', async () => {
    mockGet({ Order: legacyOrders, User: usersFixture });

    await expect(getOrders()).resolves.toEqual(legacyOrders);
    await expect(getUsers()).resolves.toEqual(usersFixture);
  });

  it('turns fetch failures into readable errors', async () => {
    mockGet({ Order: httpError(502, '', 'Bad Gateway'), User: networkError('timeout of 5000ms exceeded') });

    await expect(getOrders()).rejects.toThrow('Fetch error 502 Bad Gateway');
    await expect(getUsers()).rejects.toThrow('timeout of 5000ms exceeded');
  });

  describe('getCraftingQueue', () => {
    it('reads the current API order shape (itemName, quantity, createdDateTime, expedite)', async () => {
      mockGet({ Order: ordersFixture, User: usersFixture });

      const { activeItems, queuedItems } = await getCraftingQueue();

      expect(activeItems.map((j) => j.name)).toEqual(['Steel Workbench 1800mm', 'Steel Workbench 1800mm']);
      expect(activeItems[0]).toMatchObject({ qty: 2, progress: 50, timeLeft: '45 min left', employeeName: 'Naledi Dlamini', createdDateTime: '2026-11-01T08:00:00Z' });
      expect(queuedItems.map((j) => j.name)).toEqual(['Emergency Stop Button', 'Hex Bolt M10']);
      // Expedited order: the 50 remaining minutes run at double speed.
      expect(queuedItems[1]).toMatchObject({ qty: 50, timeLeft: '25 min left', materials: ['Hex Bolt M10'] });
    });

    it('labels an order without an item name by its item id', async () => {
      mockGet({ Order: [{ orderID: 7, itemID: 99, status: 'Queued', createdDateTime: '2026-11-01' }], User: [] });

      const { queuedItems } = await getCraftingQueue();

      expect(queuedItems[0]).toMatchObject({ name: 'Order 7', materials: ['Item 99'], qty: 1 });
    });

    it('still accepts the older orderItems shape', async () => {
      mockGet({ Order: legacyOrders, User: usersFixture });

      const { activeItems, queuedItems } = await getCraftingQueue();

      expect(activeItems.map((j) => j.orderID)).toEqual([1, 2]);
      expect(activeItems[0]).toMatchObject({
        id: 'order-1',
        name: 'Gear Box',
        qty: 4,
        status: 'Active',
        progress: 50,
        timeLeft: '30 min left',
        materials: ['Gear Box'],
        employeeName: 'Naledi Dlamini',
        location: 'Order 1',
      });
      expect(activeItems[1]).toMatchObject({ name: 'Order 2', qty: 1, status: 'Paused', employeeName: 'Unknown Employee', materials: ['Item 2'], timeLeft: 'No estimate' });
      expect(queuedItems).toHaveLength(1);
      expect(queuedItems[0]).toMatchObject({ orderID: 3, status: 'Queued', employeeName: 'Thandi Mokoena', qty: 2 });
    });

    it('handles empty or missing responses', async () => {
      mockGet({ Order: null, User: null });

      await expect(getCraftingQueue()).resolves.toEqual({ activeItems: [], queuedItems: [] });
    });

    it('counts items without a quantity as one each, and ignores users without an id', async () => {
      mockGet({
        Order: [{ orderID: 9, orderDateTime: '2026-11-01', status: 'Queued', orderItems: [{ itemName: 'Widget' }, { itemName: 'Widget' }] }],
        User: [{ employeeName: 'No Id' }],
      });

      const { queuedItems } = await getCraftingQueue();

      expect(queuedItems[0].qty).toBe(2);
    });

    it('treats an order without items as a single unit', async () => {
      mockGet({ Order: [{ orderID: 8, orderDateTime: '2026-11-01', status: 'Queued' }], User: [] });

      const { queuedItems } = await getCraftingQueue();

      expect(queuedItems[0]).toMatchObject({ qty: 1, name: 'Order 8' });
    });
  });

  describe('getCraftingJobs', () => {
    const jobOrders = [
      { orderID: 5, orderDateTime: '2026-11-01T08:30:00Z', status: 'Pending', orderItems: [{ itemName: 'Shipping Box', quantity: 2 }] },
      { orderID: 6, orderDateTime: 'not-a-date', status: ' In Progress ', orderItems: [{ itemName: 'Circuit Board', quantity: 1 }] },
      { orderID: 7, orderDateTime: '2026-11-01T09:00:00Z', status: 'paused', orderItems: [] },
      { orderID: 8, orderDateTime: '2026-11-01T09:00:00Z', status: 'Complete', orderItems: [] },
      { orderID: 9, orderDateTime: '2026-11-01T09:00:00Z', status: 'In Progress', orderItems: [{ itemName: 'Gear', quantity: 3 }] },
    ];

    it('maps known statuses, derives job types and sorts in-progress first', async () => {
      mockGet({ Order: jobOrders });

      const jobs = await getCraftingJobs();

      expect(jobs.map((j) => j.id)).toEqual(['order-6', 'order-9', 'order-5', 'order-7']);
      expect(jobs[0]).toMatchObject({ name: 'Circuit Board', status: 'In Progress', progress: 45, type: 'electronics', timeLeft: 'not-a-date', materials: ['Circuit Board x1'] });
      expect(jobs[1]).toMatchObject({ type: 'mechanical', qty: 3 });
      expect(jobs[2]).toMatchObject({ name: 'Shipping Box', status: 'Queued', progress: 0, type: 'logistics', qty: 2 });
      expect(jobs[2].timeLeft).not.toBe('2026-11-01T08:30:00Z');
      expect(jobs[3]).toMatchObject({ name: 'Order #7', status: 'Paused', qty: 1, materials: [] });
    });

    it('counts items without a quantity and sorts same-status jobs by id', async () => {
      mockGet({
        Order: [
          { orderID: 22, orderDateTime: '2026-11-01', status: 'Pending', orderItems: [{ itemName: 'Box' }] },
          { orderID: 21, orderDateTime: '2026-11-01', status: 'Pending', orderItems: [{ itemName: 'Control unit', quantity: 2 }] },
        ],
      });

      const jobs = await getCraftingJobs();

      expect(jobs.map((j) => j.id)).toEqual(['order-21', 'order-22']);
      expect(jobs[1].qty).toBe(1);
      expect(jobs[0].type).toBe('electronics');
    });

    it('groups jobs into active and queued', async () => {
      mockGet({ Order: jobOrders });

      const { activeItems, queuedItems } = await getActiveAndQueuedJobs();

      expect(activeItems.map((j) => j.status)).toEqual(['In Progress', 'In Progress', 'Paused']);
      expect(queuedItems.map((j) => j.id)).toEqual(['order-5']);
    });
  });

  describe('writes', () => {
    it('updates an order status', async () => {
      mockWritesSucceed();

      await updateOrderStatus(101, 'Paused');

      expect(mockedAxios.put).toHaveBeenCalledWith('Order/101/status', { status: 'Paused' });
    });

    it('reports a rejected status change', async () => {
      mockedAxios.put.mockRejectedValue(httpError(400, 'Branch already has 3 active orders.', 'Bad Request'));

      await expect(updateOrderStatus(101, 'Active')).rejects.toThrow('Fetch error 400 Bad Request');
    });

    it('deletes an order', async () => {
      mockWritesSucceed();

      await deleteOrder(104);

      expect(mockedAxios.delete).toHaveBeenCalledWith('Order/104');
    });

    it('reports delete failures, including non-axios errors', async () => {
      mockedAxios.delete.mockRejectedValueOnce(httpError(404, '', 'Not Found'));
      await expect(deleteOrder(999)).rejects.toThrow('Fetch error 404 Not Found');

      mockedAxios.delete.mockRejectedValueOnce(new Error('offline'));
      await expect(deleteOrder(999)).rejects.toThrow('offline');

      mockedAxios.delete.mockRejectedValueOnce(42);
      await expect(deleteOrder(999)).rejects.toThrow('Request failed');

      mockedAxios.delete.mockRejectedValueOnce({ isAxiosError: true, message: '' });
      await expect(deleteOrder(999)).rejects.toThrow('Request failed');

      mockedAxios.delete.mockRejectedValueOnce({ isAxiosError: true, message: 'x', response: { status: 409 } });
      await expect(deleteOrder(999)).rejects.toThrow(/^Fetch error 409$/);
    });
  });

  it('exposes every function on the default export', () => {
    expect(Object.keys(orderApi).sort()).toEqual(['deleteOrder', 'getActiveAndQueuedJobs', 'getCraftingJobs', 'getCraftingQueue', 'getOrders', 'getUsers', 'updateOrderStatus']);
  });
});
