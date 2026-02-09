export type OrderSummary = {
  dealerKey: string;
  dealerId?: string;
  dealerName?: string;
  customerNo?: string;
  items: number;
  qty: number;
  updatedAt: string;
  status: "open" | "submitted";
};

export type OrderStore = {
  open: Record<string, OrderSummary>;
  archive: Record<string, OrderSummary[]>;
};

const STORAGE_KEY = "FLYER_ORDERTOOL_ORDERS_V1";

const emptyStore = (): OrderStore => ({ open: {}, archive: {} });

const safeParse = (raw: string | null): OrderStore => {
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw) as OrderStore;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    return {
      open: parsed.open && typeof parsed.open === "object" ? parsed.open : {},
      archive: parsed.archive && typeof parsed.archive === "object" ? parsed.archive : {},
    };
  } catch {
    return emptyStore();
  }
};

const resolveDealerKey = (dealerId?: string, dealerName?: string) =>
  dealerId?.trim() || dealerName?.trim() || "unbekannt";

export const loadOrderStore = (): OrderStore => {
  if (typeof window === "undefined") return emptyStore();
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
};

export const saveOrderStore = (store: OrderStore) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

export const getOpenOrder = (store: OrderStore, dealerId?: string, dealerName?: string) => {
  const key = resolveDealerKey(dealerId, dealerName);
  if (store.open[key]) return store.open[key];
  if (dealerId && dealerName && store.open[dealerName]) return store.open[dealerName];
  return null;
};

export const getArchiveOrders = (store: OrderStore, dealerId?: string, dealerName?: string) => {
  const key = resolveDealerKey(dealerId, dealerName);
  if (store.archive[key]) return store.archive[key];
  if (dealerId && dealerName && store.archive[dealerName]) return store.archive[dealerName];
  return [];
};

export const openOrder = (params: { dealerId?: string; dealerName?: string; customerNo?: string }) => {
  const store = loadOrderStore();
  const dealerKey = resolveDealerKey(params.dealerId, params.dealerName);
  if (!store.open[dealerKey]) {
    store.open[dealerKey] = {
      dealerKey,
      dealerId: params.dealerId,
      dealerName: params.dealerName,
      customerNo: params.customerNo,
      items: 0,
      qty: 0,
      updatedAt: new Date().toISOString(),
      status: "open",
    };
    saveOrderStore(store);
  }
  return store;
};

export const submitOrder = (params: { dealerId?: string; dealerName?: string }) => {
  const store = loadOrderStore();
  const dealerKey = resolveDealerKey(params.dealerId, params.dealerName);
  const current = store.open[dealerKey];
  if (!current) return store;
  const archived = store.archive[dealerKey] ?? [];
  archived.unshift({ ...current, status: "submitted", updatedAt: new Date().toISOString() });
  store.archive[dealerKey] = archived;
  delete store.open[dealerKey];
  saveOrderStore(store);
  return store;
};
