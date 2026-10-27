-- 026: Manual Review status "waiting_documents".
--
-- Request documents moves the case to waiting_documents (was: in_review). When a document is uploaded to
-- the application, the case goes back to in_review for its reviewer. The case stays open meanwhile.

ALTER TABLE manual_reviews
    MODIFY COLUMN status ENUM('unassigned', 'assigned', 'in_review', 'waiting_documents', 'resolved') NOT NULL DEFAULT 'unassigned';
