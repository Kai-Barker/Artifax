import React, { FC, useMemo, useState, useEffect } from 'react';
import './historyPanel.css';
import SearchInput from '../../../../components/common/SearchInput';
import FilterSelect from '../../../../components/common/FilterSelect';
import unitIcon from '../../../../assets/images/uniitIcon.png';
import unitIconWhite from '../../../../assets/images/uniitIconWhite.png';
import viewIcon from '../../../../assets/images/View Icon.png';
import { useApi, useThemeAwareIcon } from '../../../../hooks';

interface OrderHistoryDto {
  orderID: number;
  itemID: number;
  itemName: string;
  quantity: number;
  completedDateTime?: string | null;
  createdDateTime?: string | null;
  status: string;
  employeeName?: string;
}

interface IngredientDto {
  ingredientID?: number;
  itemID?: number;
  itemName?: string;
  quantity?: number;
}

interface SelectOption {
  label: string;
  value: string;
}

interface StatusCounts {
  [key: string]: number;
  All: number;
  Complete: number;
  Cancelled: number;
}

const STATUS_TABS: SelectOption[] = [
  { label: 'All', value: 'All' },
  { label: 'Complete', value: 'Complete' },
  { label: 'Cancelled', value: 'Cancelled' }
];

const SORT_OPTIONS: SelectOption[] = [
  { label: 'Item Name', value: 'itemName' },
  { label: 'Date', value: 'date' },
  { label: 'Qty', value: 'qty' },
  { label: 'Employee', value: 'employee' }
];

const HistoryPanel: FC = () => {
  const api = useApi();
  const [activeTab, setActiveTab] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sortKey, setSortKey] = useState<string>('itemName');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [historyData, setHistoryData] = useState<OrderHistoryDto[]>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [ingredientsByOrderId, setIngredientsByOrderId] = useState<Record<number, IngredientDto[]>>({});
  const [loadingIngredientsOrderId, setLoadingIngredientsOrderId] = useState<number | null>(null);
  const unitIconSrc = useThemeAwareIcon(unitIcon, unitIconWhite);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    const loadHistory = async (): Promise<void> => {
      try {
        const response = await api.get<OrderHistoryDto[]>('/Order');
        const allOrders = response.data || [];
        const historyOrders = allOrders.filter((o) => {
          const s = (o.status || '').toLowerCase();
          return s === 'complete' || s === 'completed' || s === 'cancelled' || s === 'canceled';
        });
        setHistoryData(historyOrders);
      } catch (error) {
        console.error('Failed to load order history', error);
        setHistoryData([]);
      }
    };
    void loadHistory();
  }, [api]);

  const statusCounts: StatusCounts = useMemo(() => {
    return historyData.reduce(
      (counts, order) => {
        const status = (order.status || 'Unknown').toLowerCase();
        counts.All += 1;
        if (status === 'complete' || status === 'completed') counts.Complete += 1;
        if (status === 'cancelled' || status === 'canceled') counts.Cancelled += 1;
        return counts;
      },
      { All: 0, Complete: 0, Cancelled: 0 }
    );
  }, [historyData]);

  const filteredData = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return historyData
      .filter((order) => {
        // Treat spelling variants as one status, matching how the tab counts are worked out.
        const raw = (order.status || 'Unknown').toLowerCase();
        const status = raw === 'completed' ? 'complete' : raw === 'canceled' ? 'cancelled' : raw;
        const normActive = activeTab.toLowerCase();
        const normFilter = statusFilter.toLowerCase();
        if (activeTab !== 'All' && status !== normActive) return false;
        if (statusFilter !== 'All' && status !== normFilter) return false;

        if (!normalizedSearch) return true;
        return [order.itemName, order.employeeName || '', raw]
          .some((value) => value.toLowerCase().includes(normalizedSearch));
      })
      .sort((a, b) => {
        if (sortKey === 'qty') return (b.quantity || 0) - (a.quantity || 0);
        if (sortKey === 'date') return new Date(b.createdDateTime || 0).getTime() - new Date(a.createdDateTime || 0).getTime();
        if (sortKey === 'itemName') return (a.itemName || '').localeCompare(b.itemName || '');
        if (sortKey === 'employee') return (a.employeeName || '').localeCompare(b.employeeName || '');
        return 0;
      });
  }, [activeTab, statusFilter, sortKey, searchQuery, historyData]);

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredData, currentPage]);

  const handlePageChange = (page: number): void => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleViewClick = async (order: OrderHistoryDto): Promise<void> => {
    if (expandedOrderId === order.orderID) {
      setExpandedOrderId(null);
      return;
    }

    setExpandedOrderId(order.orderID);

    if (ingredientsByOrderId[order.orderID]) {
      return;
    }

    setLoadingIngredientsOrderId(order.orderID);
    try {
      const response = await api.get<IngredientDto[]>(`/Item/itemIngredient/item/${order.itemID}`);
      setIngredientsByOrderId((prev) => ({
        ...prev,
        [order.orderID]: response.data || [],
      }));
    } catch (error) {
      console.error(`Failed to load ingredients for item ${order.itemID}`, error);
      setIngredientsByOrderId((prev) => ({
        ...prev,
        [order.orderID]: [],
      }));
    } finally {
      setLoadingIngredientsOrderId(null);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, statusFilter, sortKey, searchQuery]);

  const formatDate = (dateString: string | undefined | null): string => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return 'N/A';
      return new Intl.DateTimeFormat('en-ZA', { dateStyle: 'short', timeStyle: 'short' }).format(date);
    } catch {
      return 'N/A';
    }
  };

  return (
    <section className="history-panel">
      <div className="history-panel-top">
        <div className="history-title-group">
          <div>
            <h2>Crafting History</h2>
            <p className="history-meta">{historyData.length} orders</p>
          </div>
        </div>

        <div className="history-controls">
          <div className="history-search">
            <label className="history-search-label" htmlFor="history-search-input">Search:</label>
            <SearchInput
              id="history-search-input"
              placeholder="Search items, employee..."
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </div>
          <div className="history-select-wrapper">
            <label>Status:</label>
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              ariaLabel="Status filter"
              options={[
                { label: 'All', value: 'All' },
                { label: 'Complete', value: 'Complete' },
                { label: 'Cancelled', value: 'Cancelled' },
              ]}
            />
          </div>
          <div className="history-select-wrapper">
            <label>Sort:</label>
            <FilterSelect
              value={sortKey}
              onChange={setSortKey}
              ariaLabel="Sort filter"
              options={SORT_OPTIONS}
            />
          </div>
        </div>
      </div>

      <div className="history-tabs">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`history-tab ${activeTab === tab.value ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label} ({statusCounts[tab.value]})
          </button>
        ))}
      </div>

      <div className="history-table-wrapper">
        <table className="history-table">
          <thead>
            <tr>
              <th>ITEM</th>
              <th>DATE</th>
              <th>QTY</th>
              <th>EMPLOYEE</th>
              <th>STATUS</th>
              <th>VIEW</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((order) => {
              const isExpanded = expandedOrderId === order.orderID;
              const ingredients = ingredientsByOrderId[order.orderID] || [];
              const isLoading = loadingIngredientsOrderId === order.orderID;

              return (
                <React.Fragment key={order.orderID}>
                  <tr>
                    <td>
                      <div className="history-item-cell">
                        <img src={unitIconSrc} alt="item icon" className="table-item-icon" />
                        <div>
                          <div className="item-name">{order.itemName}</div>
                          <div className="item-subtitle">{`Order #${order.orderID}`}</div>
                        </div>
                      </div>
                    </td>
                    <td>{formatDate(order.completedDateTime || order.createdDateTime)}</td>
                    <td>{order.quantity}</td>
                    <td>{order.employeeName || 'Unknown'}</td>
                    <td>
                      <span className={`status-pill ${(order.status || 'unknown').toLowerCase().replace(' ', '-')}`}>
                        {order.status || 'Unknown'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`icon-action-button ${isExpanded ? 'active' : ''}`}
                        aria-label={`View ${order.itemName}`}
                        onClick={() => {
                          void handleViewClick(order);
                        }}
                      >
                        <img src={viewIcon} alt="" aria-hidden="true" className="icon-action-button-icon" />
                        <span className="sr-only">View</span>
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="history-expanded-row">
                      <td colSpan={6}>
                        <div className="history-ingredients-panel">
                          <h4 className="ingredients-title">Ingredients Used</h4>
                          {isLoading ? (
                            <p className="loading-text">Loading ingredients...</p>
                          ) : ingredients.length === 0 ? (
                            <p className="empty-text">No ingredients recorded for this item.</p>
                          ) : (
                            <div className="ingredients-grid">
                              {ingredients.map((ingredient, idx) => (
                                <div key={idx} className="ingredient-item">
                                  <span className="ingredient-name">{ingredient.itemName}</span>
                                  <span className="ingredient-qty">×{ingredient.quantity}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="history-footer">
        <span>Showing {paginatedData.length} of {filteredData.length} items · Rows per page {ITEMS_PER_PAGE}</span>
        <div className="history-pagination-controls">
          <button
            type="button"
            className="pagination-btn"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              type="button"
              className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
              onClick={() => handlePageChange(page)}
            >
              {page}
            </button>
          ))}
          <button
            type="button"
            className="pagination-btn"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            ›
          </button>
        </div>
      </div>
    </section>
  );
};

export default HistoryPanel;
