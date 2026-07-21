CREATE TABLE course (
    course_id   INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    course_code VARCHAR(50)    NOT NULL,
    name        VARCHAR(255)   NOT NULL,
    units       DECIMAL(3,1)   NOT NULL,
    year_level  VARCHAR(20)    NULL,
    semester    VARCHAR(20)    NULL,
    description TEXT           NULL,
    PRIMARY KEY (course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
