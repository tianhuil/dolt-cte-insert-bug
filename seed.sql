CREATE TABLE employees (
  id INT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  department VARCHAR(50) NOT NULL,
  skills JSON,
  metadata JSON
);
INSERT INTO employees VALUES
  (1, 'Alice Chen', 'Engineering', JSON_ARRAY('python', 'sql', 'k8s'), JSON_OBJECT('level', 'senior', 'mentor', true)),
  (2, 'Bob Martinez', 'Engineering', JSON_ARRAY('java', 'aws', 'terraform'), JSON_OBJECT('level', 'staff', 'mentor', true)),
  (3, 'Carol Smith', 'Design', JSON_ARRAY('figma', 'sketch', 'prototyping'), JSON_OBJECT('level', 'mid', 'remote', true)),
  (4, 'Dave Johnson', 'Product', JSON_ARRAY('analytics', 'sql', 'user-research'), JSON_OBJECT('level', 'senior', 'remote', false)),
  (5, 'Eve Williams', 'Engineering', JSON_ARRAY('rust', 'python', 'distributed-systems'), JSON_OBJECT('level', 'senior', 'mentor', true)),
  (6, 'Frank Brown', 'Marketing', JSON_ARRAY('content', 'seo', 'analytics'), JSON_OBJECT('level', 'mid', 'remote', true));
CREATE TABLE skill_summary (
  skill VARCHAR(100) PRIMARY KEY,
  employee_count INT NOT NULL
);
CREATE TABLE debug_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  msg TEXT
);
