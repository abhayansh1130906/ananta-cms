insert into content_types (key, name, is_singleton, fields) values
('events', 'Events', false, '[
  {"name":"title","label":"Title","type":"text","required":true},
  {"name":"description","label":"Description","type":"richtext"},
  {"name":"date","label":"Date","type":"date","required":true},
  {"name":"time","label":"Time","type":"time","required":true},
  {"name":"venue","label":"Venue","type":"text"},
  {"name":"banner","label":"Banner","type":"image"},
  {"name":"registration_url","label":"Registration URL","type":"url"}
]'),
('announcements', 'Announcements', false, '[
  {"name":"title","label":"Title","type":"text","required":true},
  {"name":"body","label":"Body","type":"richtext"},
  {"name":"pinned","label":"Pinned","type":"boolean"}
]'),
('schedule', 'Schedule', false, '[
  {"name":"day","label":"Day","type":"text","required":true},
  {"name":"slots","label":"Slots","type":"list","of":[
    {"name":"time","type":"time"},{"name":"title","type":"text"},{"name":"location","type":"text"}]}
]'),
('coordinators', 'Coordinators', false, '[
  {"name":"name","label":"Name","type":"text","required":true},
  {"name":"role","label":"Role","type":"text"},
  {"name":"photo","label":"Photo","type":"image"},
  {"name":"phone","label":"Phone","type":"text"},
  {"name":"email","label":"Email","type":"text"}
]'),
('faqs', 'FAQs', false, '[
  {"name":"question","label":"Question","type":"text","required":true},
  {"name":"answer","label":"Answer","type":"richtext","required":true}
]'),
('pages', 'Pages', false, '[
  {"name":"title","label":"Title","type":"text","required":true},
  {"name":"hero_image","label":"Hero image","type":"image"},
  {"name":"body","label":"Body","type":"richtext"}
]');