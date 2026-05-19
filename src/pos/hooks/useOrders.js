import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../lib/supabase";

export function useOrders() {
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef(null);

  const fetchOrders = useCallback(async (status = null) => {
    setLoading(true);
    try {
      let q = supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      setOrders(data || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchOrders();
    const channel = supabase
      .channel("orders_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, payload => {
        setOrders(prev => {
          if (payload.eventType === "INSERT") return [payload.new, ...prev];
          if (payload.eventType === "UPDATE") return prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o);
          if (payload.eventType === "DELETE") return prev.filter(o => o.id !== payload.old.id);
          return prev;
        });
      })
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [fetchOrders]);

  const getOrdersByStatus = useCallback(status => orders.filter(o => o.status === status), [orders]);
  const refreshOrders     = useCallback(() => fetchOrders(), [fetchOrders]);

  return { orders, loading, refreshOrders, getOrdersByStatus };
}

export default useOrders
