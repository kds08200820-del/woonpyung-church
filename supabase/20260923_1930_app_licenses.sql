-- 설교자의 성경 — 설치 식별 코드와 설치된 PC 정보
-- 코드 자체는 저장하지 않고 SHA-256 해시만 둔다. 코드 본문은 배포자가 따로 보관한다.
-- 되돌리기: 이 표만 새로 만든 것이므로  alter table public.app_licenses rename to app_licenses_archived;

create table if not exists public.app_licenses (
  id               serial primary key,
  no               int not null unique,              -- 코드 번호 (배포 목록의 순서)
  code_hash        text not null unique,             -- sha256(코드 16자, 하이픈 없이)
  label            text not null default '',         -- 누구에게 준 코드인지 (관리자가 적음)
  pc_id            text,                             -- 설치된 PC 의 고유 번호 (메인보드·UUID·CPU 해시)
  pc_name          text,
  pc_board         text,
  pc_os            text,
  app_version      text,
  activated_at     timestamptz,                      -- 처음 설치 등록한 때
  last_verified_at timestamptz,                      -- 마지막으로 인증한 때
  verify_count     int not null default 0,
  revoked          boolean not null default false,   -- 사용 중지
  note             text not null default '',
  created_at       timestamptz not null default now()
);

alter table public.app_licenses enable row level security;

-- 관리자만 본다·고친다·지운다. 앱과 설치 마법사는 Edge Function(license)이 service_role 로 대신 다룬다.
drop policy if exists "admin all app_licenses" on public.app_licenses;
create policy "admin all app_licenses" on public.app_licenses for all
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));

insert into public.app_licenses (no, code_hash) values
  (1, '2c2014e7937aa30793e2e361219eb7e1641e11c4512589409d00b29855adedbc'),
  (2, '506acb104dbb19918210688f2bb30152b60a0ccacf278248bef4f0d31f78ad43'),
  (3, '9c2215125dedb434c9cf27a6520894fedc0f07a64bf89df2661199a1fc96dd9c'),
  (4, '21db4d4f165914d3bfa4fb30fbee0c5fed283709e6869baf4c62851faa719c67'),
  (5, '2a4eee8f7680d085723caec437ced778d674e7b9e200fdf7c5fd52202ed435aa'),
  (6, '7a25fd1ef08fa4e90ac9a52b06f763684c5446890e07157fc5164d196dcdc701'),
  (7, 'a3e6240b42430da5f16ca609e0d284f653eab844176a26da3072d3d8139bbdae'),
  (8, '2533ab36b54b4a0392c410b51f16a7f2195fc5872a392ee3cda133ed64913984'),
  (9, 'f0f0b80eec53e46c28109face46aec78ca9b5b35a657287bda849406c18bb4d7'),
  (10, '1e55e6c372ef3d060b693f5858f8a6afe9d6de308270dfda0f84e59a91996867'),
  (11, 'e07f8e1d76e5c517c855e2620a08b132948c9438e5536f0efb18a8a7a857269b'),
  (12, '18e6071a2cc1a229cd0a53eccfba8598a055e28590c638d84387ba61e113f7f7'),
  (13, 'b8e8708aeea84ba9a23dcd771a86b8b9367a6e7e395916a1929d3d48f39f09cd'),
  (14, '91ce11dfd98551ea320d5350067c8d19e9a0e1394187a57a9336169a6ec53ab7'),
  (15, 'a9506dfd20dbe15b024e0836cd7eed4fa99684d43aebc253269a6cbe2b7634f1'),
  (16, 'b4a25ebc2d211b0cfae317edc7aa08f4f31ee1f087425d7b9b0db6c90a003c56'),
  (17, '1cd2ac65f8435c1bc618bee67410cde189d0a6944ded2a2ab2f1d059a94c1330'),
  (18, '1500c55ce3215048876c0d3b9258b0efdd44d83f23fe58c87237ffb89873b766'),
  (19, '7a44eaead701b9b5448784bccf333e99f18f7fcfdfd6c911877ada15b138e0bb'),
  (20, 'd14aff6ad3ae81f0a7543801f60ddd9341bcafbe9510de272c37e16313513710'),
  (21, '012436350980a18a4f820a9dfcf02ad5abf2b119ecb223888a3024b2d5777f81'),
  (22, '1accd1a700babac1be0693c5ee25946890f38310450e5c41edc8fd87fa182430'),
  (23, 'd01632e47b5b19b50206cfaee136e97e249f30a00304a308da632f9f01a8298e'),
  (24, 'd552bfe772965affed53514b169bdb9f641245fa0833d25c138c3acb78014993'),
  (25, 'ecded366b75f12592f7d2e02d07cbd974491525723b0041160c9373d621d2fed'),
  (26, '3ce57be41ccaa40124977398e975ef8926b8dbc0f1987c54ad2f89e82e4b5589'),
  (27, 'e8f7d3de30d38c2625c574075cd618ce0a2595bfffa06fa6a37912b25c601ce1'),
  (28, 'ab6538d1417e396b53cdbdb829ebb74d2326ddbd6b64e892c686c62bc119dfc7'),
  (29, '50ee6c9a47bcfeff10a5d4edaf62c1f102df7f54a4e19adb90f69e42e5e7fc50'),
  (30, '6ab0285ab9fff41f3931025334914328e1300f25cf51e9baf38f57ccfd5ba139'),
  (31, 'ee9091d8b5f17f068a4fcd161fae806d3eb6fbc77cc4d22d76b3fb48af81ab07'),
  (32, '05dd79824dbaad8c3779756059ab3fc8e44273da5798b327e3fab075c979b1a3'),
  (33, 'c964a9c034031db9a6752c12e9e149c7223a0758472b6fb5c6c5cd97a583d66c'),
  (34, '02c43c5cac067d28b2cba6ab657c2b4dccf47b398a101325ed2ebbf624950fad'),
  (35, '4a8c57357e9dec7a068553246e92d483f3deaf04d8f8c100912cf0dc01e5e668'),
  (36, '9c8b6ea7c8134bb6042edeff94d17af6f8907733975fac251e6b6156df72598b'),
  (37, '818f0783a9265a077112b08048591e2b054b679c6e90f544aa7e5fc9f091241d'),
  (38, '2eaa1d5bca4b13c605fbc11b3772cbb38073ba00d7306c66335cec8812229be4'),
  (39, '1287aca45bab69c7dba5b378209a28ee23fc698107a72e3087ac821cdc42a810'),
  (40, '52ad86922f715961f9929a688dfda979d2fc7082642551a2ca4136c27f90e3c6'),
  (41, 'd93f6380e1d6742d0e0045ed75bfa7b3174e3888c3e491356d16fb16e30f94d5'),
  (42, '8d5b04f1c78adea909be607560d261cf5778b759a04b0808416656859299bdbb'),
  (43, '1ea7fbf0af9969b53a918a6b9794f5d9a8e38e605835a073867b21048c39d54d'),
  (44, '93521a1960ac7ab627bd4388330160a1610ddd7e1bd1c2ce2034f924c7208f82'),
  (45, '90aff354928921003cdc1706ce94409a4e95fc6cbc4e328bc4a6af23706edeeb'),
  (46, 'fef388c391f56d424fefbf044f30049602022352cef6cf8335ff3799de4f627d'),
  (47, '55e16ea259021c6bd226d71dffedea3bcb781b5b59a6a99adbb1de849548a519'),
  (48, 'be2cd9c29f4ef70e06ab1f6354fba6e33873ab744400164ab76008bef757063a'),
  (49, 'f06ce73b368205fe5ed0c9e914bf187f01ec00004da96fd847ae5088ff9ae2ca'),
  (50, '4b33916b93d6b0b0aba33e6a30f1b3823a1092f6db1c1a412af9313ca5aba775')
on conflict (no) do nothing;
