insert into territories (profile_email, country, plz2_from, plz2_to)
select 'b.zoechbauer@flyer.ch', 'AT', 0, 99
where not exists (
  select 1
  from territories
  where profile_email = 'b.zoechbauer@flyer.ch'
    and country = 'AT'
    and plz2_from = 0
    and plz2_to = 99
);
