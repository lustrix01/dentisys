CREATE TABLE component_type (
    ct_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ct_code     VARCHAR(15)  NOT NULL,
    ct_name     VARCHAR(100) NOT NULL,
    domain      VARCHAR(15)  NOT NULL,
    description VARCHAR(255) NULL,
    PRIMARY KEY (ct_id),
    CONSTRAINT uq_component_type_code UNIQUE (ct_code),
    CONSTRAINT chk_component_type_domain CHECK (domain IN ('lecture', 'laboratory'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO component_type (ct_code, ct_name, domain) VALUES
('TERM_EXAM',    'Term Examination',       'lecture'),
('LEC_QUIZ',     'Lecture Quiz',           'lecture'),
('RECIT',        'Recitation',             'lecture'),
('OUTPUT',       'Output',                 'lecture'),
('PRAC_EXAM',    'Practical Examination',  'laboratory'),
('LAB_EXERCISE', 'Laboratory Exercise',    'laboratory'),
('LAB_QUIZ',     'Laboratory Quiz',        'laboratory'),
('LAB_PERF',     'Laboratory Performance', 'laboratory');
