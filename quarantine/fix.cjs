const fs = require('fs');
const lines = fs.readFileSync('src/components/PcDashboard.jsx', 'utf-8').split('\n');

const containerIndex = lines.findIndex(l => l.includes('<div className="container">'));

if (containerIndex !== -1) {
  const topBlock = `import React, { useState, useRef } from 'react';
import { LineChart, LayoutDashboard, Share2, ExternalLink, Activity, Upload, RotateCcw, RefreshCw, Trash2, Power, LogOut, UserCog, Archive } from 'lucide-react';
import SignalIndicator from '../SignalIndicator';
import AdminDashboard from './AdminDashboard.jsx';
import UserProfile from './UserProfile.jsx';
import RoiRankingWidget from './RoiRankingWidget.jsx';
import ReportArchive from './ReportArchive.jsx';

const PcDashboard = ({ manager, user, clearAuth }) => {
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isReportArchiveOpen, setIsReportArchiveOpen] = useState(false);
  const fileInputRef = useRef(null);

  const {
      stocks, signals, lastUpdate,
      searchQuery, setSearchQuery,
      marketFilter, setMarketFilter,
      categoryFilter, setCategoryFilter,
      showAll, setShowAll,
      uploadTimeframe, setUploadTimeframe,
      selectedStocks, toggleSelectAll, toggleSelectStock,
      isSyncing, isSendingTg, 
      candidates, topSectors, activeCount, 
      handleCsvUpload, handleReset, handleAutoSync,
      handleDownloadReport, handleDownloadTVList, handleSendToTelegram
  } = manager;

  return (`;

  const bottomBlock = lines.slice(containerIndex).join('\n');
  
  fs.writeFileSync('src/components/PcDashboard.jsx', topBlock + '\n' + bottomBlock);
  console.log("PcDashboard fixed successfully.");
} else {
  console.log("Could not find <div className=\"container\">");
}
