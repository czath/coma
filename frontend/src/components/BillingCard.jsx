import React, { useState, useEffect } from 'react';
import { CreditCard, DollarSign, Database, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

export default function BillingCard({ jobId, status }) {
    const [billingData, setBillingData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [error, setError] = useState(null);

    const fetchBilling = async () => {
        if (!jobId) return;
        setLoading(true);
        try {
            const res = await fetch(`http://localhost:8000/billing/${jobId}`);
            if (res.ok) {
                const data = await res.json();
                setBillingData(data);
                setError(null);
            } else {
                // If 404, it might just mean no usage yet, which is fine
                if (res.status === 404) {
                    setBillingData(null);
                } else {
                    console.warn("Failed to fetch billing info");
                }
            }
        } catch (e) {
            console.error("Billing fetch error:", e);
            setError("Connection Error");
        } finally {
            setLoading(false);
        }
    };

    // Auto-poll when processing, or fetch once on mount/status change
    useEffect(() => {
        fetchBilling();

        let interval = null;
        if (status === 'processing' || status === 'ingesting' || status === 'analyzing') {
            interval = setInterval(fetchBilling, 3000); // Poll every 3s
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [jobId, status]);

    if (!jobId && !billingData) return null;

    // Formatting Helpers
    const formatCost = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 }).format(val || 0);
    const formatTokens = (val) => new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(val || 0);

    const totalCost = billingData?.total_cost_usd || 0.0;
    const models = billingData?.usage || {};

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-4">
            {/* Header / Summary */}
            <div
                className="p-4 flex items-center justify-between cursor-pointer bg-gradient-to-r from-gray-50 to-white"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                        <DollarSign size={18} />
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Estimated Cost</div>
                        <div className="font-bold text-gray-900 text-lg font-mono">
                            {formatCost(totalCost)}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {loading && <RefreshCw size={14} className="animate-spin text-gray-400" />}
                    {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </div>
            </div>

            {/* Expanded Details */}
            {expanded && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                    {Object.keys(models).length === 0 ? (
                        <div className="text-center text-xs text-gray-400 py-2">No usage data recorded yet.</div>
                    ) : (
                        <div className="space-y-4">
                            {Object.entries(models).map(([modelName, stats]) => (
                                <div key={modelName} className="text-sm border-b border-gray-50 last:border-0 pb-2 last:pb-0">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-bold text-gray-700 truncate w-32" title={modelName}>{modelName}</span>
                                        <span className="font-mono text-gray-900 font-bold">{formatCost(stats.total_cost || stats.cost)}</span>
                                    </div>

                                    {/* Input Stats */}
                                    <div className="flex justify-between items-center text-xs text-gray-600 mb-0.5">
                                        <span className="flex items-center gap-1">
                                            <span className="w-10 text-gray-400 uppercase text-[10px]">Input</span>
                                            <span className="font-mono bg-gray-50 px-1 rounded">{formatTokens(stats.input)}</span>
                                        </span>
                                        <span className="font-mono text-gray-500">{formatCost(stats.input_cost || 0)}</span>
                                    </div>

                                    {/* Output Stats */}
                                    <div className="flex justify-between items-center text-xs text-gray-600">
                                        <span className="flex items-center gap-1">
                                            <span className="w-10 text-gray-400 uppercase text-[10px]">Output</span>
                                            <span className="font-mono bg-gray-50 px-1 rounded">{formatTokens(stats.output)}</span>
                                        </span>
                                        <span className="font-mono text-gray-500">{formatCost(stats.output_cost || 0)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {error && (
                        <div className="mt-2 text-xs text-red-500 text-center">{error}</div>
                    )}

                    <div className="mt-3 text-[10px] text-gray-400 text-center border-t border-gray-100 pt-2">
                        Updated: {billingData?.last_updated ? new Date(billingData.last_updated).toLocaleTimeString() : 'Never'}
                    </div>
                </div>
            )}
        </div>
    );
}
