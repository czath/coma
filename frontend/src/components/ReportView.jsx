import React from 'react';

export default function ReportView({ clauses }) {
    const mockExecutiveSummary = "The review of the Master Services Agreement indicates general compliance with the internal playbook, with one critical deviation found in Section 3 (Term and Termination). The agreement permits termination with 30 days notice, whereas the playbook mandates 60 days. This deviation presents a High Risk and requires immediate negotiation or approval.";
    const playbookInput = "Termination: Must require 60 days prior written notice.";

    return (
        <div className="flex flex-col h-full bg-white rounded-xl shadow-sm m-6 p-8 overflow-hidden">
            <div className="flex-grow overflow-y-auto pr-2">
                <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-4">Executive Summary & Compliance Report</h2>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Legal Playbook / Guidelines Used for Comparison</label>
                    <textarea readOnly className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 text-sm h-20 resize-none" value={playbookInput}></textarea>
                </div>

                <div className="mb-6">
                    <h3 className="text-lg font-semibold text-indigo-700 mb-2">Executive Summary</h3>
                    <div className="p-4 border border-indigo-300 bg-indigo-50 rounded-lg shadow-inner text-sm text-gray-700 leading-relaxed">
                        {mockExecutiveSummary}
                    </div>
                </div>

                <div className="mb-6">
                    <h3 className="text-lg font-semibold text-indigo-700 mb-2">Clause-by-Clause Compliance Report</h3>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clause</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Compliant?</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Risk Level</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deviation Summary</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {[...clauses].sort((a, b) => {
                                    if (a.start.line !== b.start.line) return a.start.line - b.start.line;
                                    return a.start.ch - b.start.ch;
                                }).map((item, idx) => (
                                    <tr key={item.id || idx}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {item.header}
                                            {!item.end && <span className="ml-2 text-xs text-amber-600 font-bold">(In Progress)</span>}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {item.compliance ? (
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.compliance === 'Yes' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                    {item.compliance}
                                                </span>
                                            ) : (
                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-500">Not Assessed</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {item.risk ? (
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.risk === 'High' ? 'bg-red-100 text-red-800' : 'bg-gray-200 text-gray-800'}`}>
                                                    {item.risk}
                                                </span>
                                            ) : (
                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-500">Not Assessed</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">N/A</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t flex justify-end space-x-3 shrink-0">
                <button className="py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition duration-150">
                    Export Summary (.md)
                </button>
                <button className="py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition duration-150">
                    Export Full Report (.json)
                </button>
            </div>
        </div>
    );
}
