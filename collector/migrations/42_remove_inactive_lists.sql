-- Time for a grow up if you have anything against like statement
UPDATE public.serverlists
SET active = false
WHERE url like 'https://raw.githubusercontent.com/Anuken/Mindustry/%'
