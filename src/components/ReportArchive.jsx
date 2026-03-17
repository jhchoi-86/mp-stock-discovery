import React, { useEffect, useState } from 'react';
import axiosClient from '../api/axiosClient';
import { Archive, X, Clock, FileText, ChevronRight } from 'lucide-react';

export default function ReportArchive({ isOpen, onClose }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchReports = async () => {
      setLoading(true);
      try {
        const res = await axiosClient.get('/api/reports');
        setReports(res.data);
      } catch (err) {
        console.error('Failed to fetch reports:', err);
        setError('리포트 목록을 불러오는데 실패했습니다. 권한이 없거나 네트워크 오류입니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 text-slate-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-slate-900/90 border border-slate-700 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Archive size={24} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-wide">VIP 자료실</h2>
              <p className="text-sm text-slate-400 mt-1">과거 발송된 종목 리서치 텔레그램 리포트 보관함</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-900/30">
          {loading ? (
            <div className="flex flex-col justify-center items-center h-48 space-y-4">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400">VIP 원장 데이터를 로딩중입니다...</p>
            </div>
          ) : error ? (
            <div className="bg-rose-500/10 border border-rose-500/50 text-rose-400 p-4 rounded-xl text-center">
              {error}
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center text-slate-500 py-12 flex flex-col items-center">
              <FileText size={48} className="mb-4 opacity-30" />
              <p>아직 발송된 리포트가 없습니다.</p>
            </div>
          ) : (
            reports.map(report => (
              <div 
                key={report.id} 
                className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 hover:border-indigo-500/50 transition-all group"
              >
                <div className="flex justify-between items-center mb-4 border-b border-slate-700/50 pb-3">
                  <div className="flex items-center space-x-2 text-sm text-indigo-300">
                    <Clock size={16} />
                    <span className="font-semibold">
                      {new Date(report.sentAt).toLocaleString('ko-KR', {
                        year: 'numeric', month: 'long', day: 'numeric', 
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <div className="text-xs bg-slate-700 text-slate-300 px-3 py-1 rounded-full border border-slate-600">
                    발송자: {report.author.name}
                  </div>
                </div>
                
                <div className="prose prose-invert max-w-none">
                  <pre className="text-sm font-sans text-slate-300 whitespace-pre-wrap bg-slate-900/50 p-4 rounded-lg border border-slate-800/80 leading-relaxed custom-scrollbar max-h-96 overflow-y-auto">
                    {report.content}
                  </pre>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
