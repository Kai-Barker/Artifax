import React, { useEffect, useState } from 'react';
import '../crafting/crafting.css';
import AlertStrip from '../../components/layout/AlertStrip';
import PageHeader from '../../components/layout/PageHeader';
import GraphCard from './components/graph/graph';
import MostCrafted from './components/mostCarfted/mostCarfted';
import StatsGrid from '../crafting/components/stats/stats';
import './analytics.css';
import { getInventoryOverview, type InventoryItem } from '../../services/inventoryApi';
import { getCurrentDateSAST } from '../../Date/dateUtils';

const AnalyticsPage: React.FC = () => {
  const currentDate = getCurrentDateSAST();
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  useEffect(() => {
    const loadLowStockAlerts = async (): Promise<void> => {
      try {
        const overview = await getInventoryOverview();
        setInventoryItems(overview.items);
      } catch (error) {
        console.error('Failed to load analytics low stock alerts', error);
      }
    };

    void loadLowStockAlerts();
  }, []);

  return (
    <div className="page-content">
      <div className="space-y-4 sm:space-y-5">
        <PageHeader
          title="Analytics"
          subtitle={`Crafting Analytics · ${currentDate}`}
        />
        <AlertStrip items={inventoryItems} />

        <div className="crafting-page">
          <div className="crafting-panel analytics-top-panel">
            <StatsGrid />
          </div>

          <div className="active-jobs-layout">
            <div className="active-jobs-main">
              <GraphCard />
            </div>
            <div className="active-jobs-sidebar">
              <MostCrafted />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
