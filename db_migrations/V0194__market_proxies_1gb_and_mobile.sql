UPDATE market_proxy_settings SET
  package_id = 74700,
  proxy_ru = 'http://L8h7viQaUGki:0pJBluO65hFjz3Hg@pool.proxy.market:10000', proxy_ru_id = 9617028,
  proxy_by = 'http://C3eu1ekzFPbj:tzCNdYSjD4Ufxiv6@pool.proxy.market:10000', proxy_by_id = 9617029,
  mobile_package_id = 74699,
  proxy_ru_mobile = 'http://zkg7QvoxYx3t:DznSWfTwy896xZOp@mobpool.proxy.market:10000',
  proxy_by_mobile = 'http://5EriukIMV2jw:aiFroxz8p19jYNJq@mobpool.proxy.market:10000',
  updated_at = NOW()
WHERE provider = 'proxy_market';