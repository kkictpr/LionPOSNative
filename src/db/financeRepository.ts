// src/db/financeRepository.ts

import { APP_CONFIG } from '../core/config';
import {
  salesSummary,
  topProducts,
  salesByEmployee,
} from './repository';

function todayRange() {
  const now = new Date();

  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  return {
    fromISO: from.toISOString(),
    toISO: to.toISOString(),
  };
}

function last7DaysRange() {
  const now = new Date();

  const from = new Date(now);
  from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);

  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  return {
    fromISO: from.toISOString(),
    toISO: to.toISOString(),
  };
}

// Dashboard KPI
export async function getTodayFinance() {
  const { fromISO, toISO } = todayRange();

  return salesSummary(
    APP_CONFIG.DEFAULT_STORE_ID,
    fromISO,
    toISO,
  );
}

// Top Selling
export async function getTopSelling(limit = 5) {
  const { fromISO, toISO } = last7DaysRange();

  return topProducts(
    APP_CONFIG.DEFAULT_STORE_ID,
    fromISO,
    toISO,
    limit,
  );
}

// Employee Ranking
export async function getEmployeeRanking() {
  const { fromISO, toISO } = last7DaysRange();

  return salesByEmployee(
    APP_CONFIG.DEFAULT_STORE_ID,
    fromISO,
    toISO,
  );
}