CREATE TABLE "alpha"."link" (
	"id" uuid PRIMARY KEY,
	"item_id" uuid REFERENCES "beta"."items" ("id")
);
--> statement-breakpoint
-- 주석 안의 delta.rows 는 무시한다.
INSERT INTO alpha.link SELECT id, id FROM BETA.Items;
--> statement-breakpoint
CREATE FUNCTION alpha.copy() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO alpha.link SELECT id FROM gamma.rows;
END
$$;
