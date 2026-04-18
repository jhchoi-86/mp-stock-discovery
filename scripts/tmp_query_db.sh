#!/bin/bash
psql $DATABASE_URL -c "SELECT code, name, current_price, g_sell, result_2, matched_tfs FROM ppp_watchlist WHERE code IN ('278280', '006400', '457190', '014820', '183300', '086520');"
