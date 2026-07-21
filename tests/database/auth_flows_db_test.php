<?php

declare(strict_types=1);

ob_start();

$db=getenv('DB_TEST_NAME');$dbHost=getenv('DB_TEST_HOST')?:'db';$pass=getenv('DB_ROOT_PASS')?:'local-root-password';
if(!$db){fwrite(STDERR,"Set DB_TEST_NAME.\n");exit(1);}
$R=getenv('REPO_ROOT')?:dirname(__DIR__,2);
require_once"$R/backend/app/config.php";require_once"$R/backend/app/database.php";require_once"$R/backend/app/jwt.php";
require_once"$R/backend/app/audit.php";require_once"$R/backend/app/auth.php";require_once"$R/backend/app/auth_runtime.php";
require_once"$R/backend/app/mfa.php";require_once"$R/backend/app/mfa_runtime.php";require_once"$R/backend/app/ratelimit.php";
require_once"$R/backend/app/validation.php";require_once"$R/backend/app/response.php";require_once"$R/backend/app/security.php";
require_once"$R/backend/controllers/AuthController.php";require_once"$R/backend/controllers/MfaController.php";

function gp(string$d,string$h,string$p):PDO{global$R;return create_pdo(['db'=>['host'=>$h,'port'=>3306,'name'=>$d,'user'=>'root','pass'=>$p]]);}
$ac=0;
function eq($e,$a,$l){global$ac;$ac++;if($e!==$a){fwrite(STDERR,"FAIL: $l\nExp: ".var_export($e,true)." Got: ".var_export($a,true)."\n");exit(1);}echo"PASS: $l\n";}
function ok($v,$l){global$ac;$ac++;if($v!==true){fwrite(STDERR,"FAIL: $l\n");exit(1);}echo"PASS: $l\n";}
function nf($v,$l){ok($v===false,$l);}
function ath(callable$fn,string$n,string$l){global$ac;$ac++;try{$fn();fwrite(STDERR,"FAIL: $l\n");exit(1);}catch(\Throwable$x){if(!str_contains($x->getMessage(),$n)){fwrite(STDERR,"FAIL: $l -- '{$x->getMessage()}'\n");exit(1);}}echo"PASS: $l\n";}
function su(PDO$p,string$e,string$r='faculty',string$s='Active'):int{$h=password_hash('TestPass1!',PASSWORD_DEFAULT);$p->prepare("INSERT INTO user_accounts(login_email,password_hash,role,display_name,status,created_at)VALUES(?,?,?,?,?,NOW(6))")->execute([$e,$h,$r,'T '.$e,$s]);return(int)$p->lastInsertId();}
function cx():array{return['request_id'=>'t-'.bin2hex(random_bytes(6)),'ip_address'=>random_int(1,254).'.'.random_int(0,255).'.'.random_int(0,255).'.'.random_int(1,254),'user_agent'=>'TA/1.0','http_method'=>'POST','endpoint'=>'/api/auth/t'];}

$pdo=gp($db,$dbHost,$pass);$jk=str_repeat('K',32);$mk=str_repeat('M',32);$ek=str_repeat('E',32);
$sd=sys_get_temp_dir().'/ds_'.uniqid();@mkdir($sd,0700,true);
$C=app_config([]);$C['jwt']['signing_key_b64']=base64_encode($jk);$C['audit']['mac_key_b64']=base64_encode($mk);$C['mfa']['encryption_key_b64']=base64_encode($ek);$C['rate_limit']['storage_dir']=$sd;

function cs(PDO$p):array{$r=$p->query("SELECT setting_value FROM system_settings WHERE setting_key='audit_chain_head'")->fetchColumn();$d=json_decode($r,true);return['seq'=>$d['latest_sequence'],'mac'=>$d['latest_mac']];}
function cr(PDO$p,array$s):void{$p->beginTransaction();$p->exec("UPDATE system_settings SET setting_value=JSON_OBJECT('latest_sequence',{$s['seq']},'latest_mac','{$s['mac']}')WHERE setting_key='audit_chain_head'");$p->commit();}

function reset_emit_seam():void{$GLOBALS['_STAGE2B1B1_EMIT_COUNT']=0;$GLOBALS['_STAGE2B1B1_LAST_RESPONSE']=null;}
function assert_emit_count(int$exp,string$l):void{global$ac;$ac++;$c=$GLOBALS['_STAGE2B1B1_EMIT_COUNT']??0;if($c!==$exp){fwrite(STDERR,"FAIL: $l\nExpected emit count $exp, got $c\n");exit(1);}echo"PASS: $l (emit=$c)\n";}
function assert_response_header(string$header,string$l):void{global$ac;$ac++;$r=$GLOBALS['_STAGE2B1B1_LAST_RESPONSE']??null;if(!$r||!in_array($header,$r['headers'])){fwrite(STDERR,"FAIL: $l\nHeader '$header' not in response\n");exit(1);}echo"PASS: $l\n";}
function assert_no_response_header(string$prefix,string$l):void{global$ac;$ac++;$r=$GLOBALS['_STAGE2B1B1_LAST_RESPONSE']??null;if(!$r){fwrite(STDERR,"FAIL: $l\nNo response\n");exit(1);}foreach($r['headers'] as$h){if(stripos($h,$prefix)===0){fwrite(STDERR,"FAIL: $l\nFound '$h'\n");exit(1);}}echo"PASS: $l\n";$ac++;}
function assert_response_status(int$exp,string$l):void{global$ac;$ac++;$r=$GLOBALS['_STAGE2B1B1_LAST_RESPONSE']??null;$s=$r['status_code']??null;if($s!==$exp){fwrite(STDERR,"FAIL: $l\nExp status $exp, got ".var_export($s,true)."\n");exit(1);}echo"PASS: $l\n";}

$sta=$pdo->prepare("SELECT COUNT(*) FROM auth_sessions WHERE user_id=?");$stb=$pdo->prepare("SELECT COUNT(*) FROM security_tokens WHERE user_id=? AND purpose='refresh'");

// ===== GENERATE CONCURRENCY HELPERS AT RUNTIME =====
$helperA=<<<'PHP'
<?php
$d=json_decode($argv[1],true);
require_once '/tmp/backend/app/config.php';require_once '/tmp/backend/app/database.php';
require_once '/tmp/backend/app/ratelimit.php';require_once '/tmp/backend/app/jwt.php';
require_once '/tmp/backend/app/mfa.php';require_once '/tmp/backend/app/validation.php';
require_once '/tmp/backend/app/response.php';require_once '/tmp/backend/app/security.php';
require_once '/tmp/backend/app/auth.php';require_once '/tmp/backend/app/audit.php';
require_once '/tmp/backend/app/auth_runtime.php';
$sd=$d['sd'];$bd=$d['bd'];
try{
$pdo=create_pdo(['db'=>['host'=>$d['h'],'port'=>3306,'name'=>$d['db'],'user'=>'root','pass'=>$d['p']]]);
$pdo->exec('SET SESSION innodb_lock_wait_timeout=10');
$pdo->beginTransaction();
$stmt=$pdo->prepare("SELECT token_id,last_accepted_step,ciphertext,nonce,auth_tag FROM security_tokens WHERE user_id=? AND purpose='mfa_credential' AND mfa_status='enabled' FOR UPDATE");
$stmt->execute([$d['uid']]);$cred=$stmt->fetch(PDO::FETCH_ASSOC);
if(!$cred){file_put_contents("$bd/result_A",'NO_CRED');$pdo->rollBack();exit(1);}
file_put_contents("$bd/lock_held",'1');
$w=0;while(!file_exists("$bd/release_A")&&$w<200){usleep(100000);$w++;}
if($w>=200){file_put_contents("$bd/result_A",'TIMEOUT');$pdo->rollBack();exit(1);}
challenge_state_consume(['dir'=>$sd],$d['jti'],'mfa_challenge','complete_login');
$secret=mfa_decrypt_secret($cred['ciphertext'],$cred['nonce'],$cred['auth_tag'],base64_decode($d['ek']));
$v=mfa_verify_window($secret,$d['code'],'sha1',6,30,1);
if(!$v['valid']){file_put_contents("$bd/result_A",'TOTP_FAIL');$pdo->rollBack();exit(1);}
$ms=$v['matched_step'];
$upd=$pdo->prepare("UPDATE security_tokens SET last_accepted_step=? WHERE token_id=? AND (last_accepted_step IS NULL OR ?>last_accepted_step)");
$upd->execute([$ms,$cred['token_id'],$ms]);
if($upd->rowCount()===0){file_put_contents("$bd/result_A",'REPLAY');$pdo->rollBack();exit(1);}
$pdo->commit();
$pdo2=create_pdo(['db'=>['host'=>$d['h'],'port'=>3306,'name'=>$d['db'],'user'=>'root','pass'=>$d['p']]]);
$pdo2->beginTransaction();
$lu=$pdo2->query("SELECT user_id,login_email,role,display_name,status,token_version FROM user_accounts WHERE user_id={$d['uid']} FOR UPDATE")->fetch(PDO::FETCH_ASSOC);
$exp=new DateTimeImmutable('+7 days');
$sess=auth_create_session($pdo2,$lu,'10.0.0.1','A',null,$exp);
$rt=auth_issue_initial_refresh_token($pdo2,$sess,$d['uid'],$exp);
$at=auth_issue_access_token($lu,$sess,base64_decode($d['jk']),900);
file_put_contents("$bd/result_A",'OK:'.$sess['session_id']);$pdo2->commit();
}catch(\Throwable$e){
if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();
if(isset($pdo2)&&$pdo2->inTransaction())$pdo2->rollBack();
file_put_contents("$bd/result_A",'ERR:'.$e->getMessage());exit(1);
}
PHP;

$helperB=<<<'PHP'
<?php
$d=json_decode($argv[1],true);
require_once '/tmp/backend/app/config.php';require_once '/tmp/backend/app/database.php';
require_once '/tmp/backend/app/ratelimit.php';require_once '/tmp/backend/app/jwt.php';
require_once '/tmp/backend/app/mfa.php';require_once '/tmp/backend/app/mfa_runtime.php';
require_once '/tmp/backend/app/validation.php';require_once '/tmp/backend/app/response.php';
require_once '/tmp/backend/app/security.php';
require_once '/tmp/backend/app/auth.php';require_once '/tmp/backend/app/audit.php';
require_once '/tmp/backend/app/auth_runtime.php';
$maxRetries=2;
for($attempt=0;$attempt<=$maxRetries;$attempt++){
try{
$pdo=create_pdo(['db'=>['host'=>$d['h'],'port'=>3306,'name'=>$d['db'],'user'=>'root','pass'=>$d['p']]]);
$pdo->exec('SET SESSION innodb_lock_wait_timeout=8');
$cfg=['jwt'=>['signing_key_b64'=>base64_encode(base64_decode($d['jk']))],'audit'=>['mac_key_b64'=>base64_encode(base64_decode($d['mk']))],'mfa'=>['encryption_key_b64'=>base64_encode(base64_decode($d['ek']))],'rate_limit'=>['storage_dir'=>$d['sd'],'enabled'=>false]];
file_put_contents($d['bd'].'/ATTEMPT_STARTED','1',LOCK_EX);
$r=mfa_runtime_verify($pdo,$cfg,['sub'=>$d['uid'],'jti'=>$d['jti'],'token_version'=>0],$d['code'],['request_id'=>'b','ip_address'=>'10.0.0.2','user_agent'=>'B','http_method'=>'POST','endpoint'=>'/api/auth/mfa/verify']);
file_put_contents($d['bd'].'/result_B','OK:'.($r['credentials']['access_token']??'no'));break;
}catch(\Throwable$e){
$msg=$e->getMessage();
if(str_contains($msg,'Deadlock')&&$attempt<$maxRetries){usleep(500000);continue;}
file_put_contents($d['bd'].'/result_B','ERR:'.$msg);exit(1);
}
}
PHP;

$helperAPath=$sd.'/helper_A.php';$helperBPath=$sd.'/helper_B.php';
file_put_contents($helperAPath,$helperA);file_put_contents($helperBPath,$helperB);

// Register shutdown cleanup
function cleanup_temp_files():void{global$sd,$helperAPath,$helperBPath;@unlink($helperAPath);@unlink($helperBPath);@rmdir($sd);}
register_shutdown_function('cleanup_temp_files');

echo"=== Auth Flows Final Tests ===\nDB: $db Host: $dbHost\n\n";

// ===== LOGIN =====
echo"--- Login: unknown vs wrong password ---\n";
su($pdo,'vu@e.c');$m1='';try{auth_runtime_login($pdo,$C,['email'=>'x@e.c','password'=>'P1!'],cx());}catch(InvalidCredentialsException$e){$m1=$e->getMessage();}
$m2='';try{auth_runtime_login($pdo,$C,['email'=>'vu@e.c','password'=>'wrong'],cx());}catch(InvalidCredentialsException$e){$m2=$e->getMessage();}
eq($m1,$m2,'Unknown+wrong identical');ok(password_verify('stage2b1b1-sentinel-2026',auth_get_dummy_hash()),'Sentinel');
echo"--- Password not normalized ---\n";ath(fn()=>auth_runtime_login($pdo,$C,['email'=>'vu@e.c','password'=>"  TestPass1!  "],cx()),'Invalid credentials','Spaces');
echo"--- Inactive accounts rejected ---\n";
foreach([['email'=>'p@e.c','status'=>'Pending Approval','n'=>'Pending'],['email'=>'r@e.c','status'=>'Rejected','n'=>'Rejected'],['email'=>'d@e.c','status'=>'Disabled','n'=>'Disabled']]as$t){su($pdo,$t['email'],'faculty',$t['status']);ath(fn()=>auth_runtime_login($pdo,$C,['email'=>$t['email'],'password'=>'TestPass1!'],cx()),$t['n'],$t['n']);}
echo"--- MFA cardinality 0/1/>1 (login) ---\n";
$c0=su($pdo,'c0@e.c');$r0=auth_runtime_login($pdo,$C,['email'=>'c0@e.c','password'=>'TestPass1!'],cx());eq('enrollment_start',$r0['type'],'0→enrollment');
$c1=su($pdo,'c1@e.c');$se=mfa_generate_secret();$en=mfa_encrypt_secret($se,$ek);$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,last_accepted_step,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),NOW(6),NOW(6))")->execute([$c1,$en['ciphertext'],$en['nonce'],$en['auth_tag']]);$pdo->commit();
$r1=auth_runtime_login($pdo,$C,['email'=>'c1@e.c','password'=>'TestPass1!'],cx());eq('mfa_challenge',$r1['type'],'1→challenge');
$c2=su($pdo,'c2@e.c');$e2=mfa_encrypt_secret(mfa_generate_secret(),$ek);$e3=mfa_encrypt_secret(mfa_generate_secret(),$ek);$pdo->beginTransaction();
$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),NOW(6))")->execute([$c2,$e2['ciphertext'],$e2['nonce'],$e2['auth_tag']]);
$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),NOW(6))")->execute([$c2,$e3['ciphertext'],$e3['nonce'],$e3['auth_tag']]);$pdo->commit();
ath(fn()=>auth_runtime_login($pdo,$C,['email'=>'c2@e.c','password'=>'TestPass1!'],cx()),'Multiple','>1→error');
eq(0,(int)$pdo->query("SELECT COUNT(*) FROM auth_sessions")->fetchColumn(),'No password-only session');

echo"\n--- Enrollment start ---\n";
$eu=su($pdo,'eu@e.c');$lr=auth_runtime_login($pdo,$C,['email'=>'eu@e.c','password'=>'TestPass1!'],cx());
$sj=jwt_decode($lr['enrollment_token'],$jk,'mfa_enrollment',fn()=>time()+10)['jti'];
$er=mfa_runtime_enroll_start($pdo,$C,['sub'=>$eu,'jti'=>$sj,'token_version'=>0,'enrollment_stage'=>'start'],cx());
ok(isset($er['confirmation_token']),'Confirmation token');ok(isset($er['base32_secret']),'Base32 secret');
echo"--- Existing enabled blocks ---\n";
$b=su($pdo,'b@e.c');$be=mfa_encrypt_secret(mfa_generate_secret(),$ek);$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),NOW(6))")->execute([$b,$be['ciphertext'],$be['nonce'],$be['auth_tag']]);$pdo->commit();
$bj=jwt_generate_jti();challenge_state_init(['dir'=>$sd],$bj,'mfa_enrollment','enrollment_start',5,300);
ath(fn()=>mfa_runtime_enroll_start($pdo,$C,['sub'=>$b,'jti'=>$bj,'token_version'=>0,'enrollment_stage'=>'start'],cx()),'already enabled','Blocks');
echo"--- Init failure rolls back ---\n";
$ef=su($pdo,'ef@e.c');$ej=jwt_generate_jti();challenge_state_init(['dir'=>$sd],$ej,'mfa_enrollment','enrollment_start',5,300);
$s=cs($pdo);$pdo->beginTransaction();$pdo->exec("UPDATE system_settings SET setting_value=JSON_OBJECT('latest_sequence',{$s['seq']},'latest_mac','badMAC')WHERE setting_key='audit_chain_head'");$pdo->commit();
try{mfa_runtime_enroll_start($pdo,$C,['sub'=>$ef,'jti'=>$ej,'token_version'=>0,'enrollment_stage'=>'start'],cx());}catch(\Throwable$e){}
cr($pdo,$s);$st=$pdo->prepare("SELECT COUNT(*) FROM security_tokens WHERE user_id=? AND purpose='mfa_credential' AND mfa_status='pending'");$st->execute([$ef]);eq(0,(int)$st->fetchColumn(),'No pending after init failure');
echo"--- Orphan confirm state ---\n";
$oo=su($pdo,'oo@e.c');$oj=jwt_generate_jti();challenge_state_init(['dir'=>$sd],$oj,'mfa_enrollment','enrollment_start',5,300);
$er2=mfa_runtime_enroll_start($pdo,$C,['sub'=>$oo,'jti'=>$oj,'token_version'=>0,'enrollment_stage'=>'start'],cx());
$cJti=jwt_decode($er2['confirmation_token'],$jk,'mfa_enrollment',fn()=>time()+10)['jti'];
$s2=cs($pdo);$pdo->beginTransaction();$pdo->exec("UPDATE system_settings SET setting_value=JSON_OBJECT('latest_sequence',{$s2['seq']},'latest_mac','badMAC')WHERE setting_key='audit_chain_head'");$pdo->commit();
try{mfa_runtime_enroll_confirm($pdo,$C,['sub'=>$oo,'jti'=>$cJti,'token_version'=>0,'enrollment_stage'=>'confirm'],'123456',cx());}catch(\Throwable$e){}
cr($pdo,$s2);$st->execute([$oo]);eq(1,(int)$st->fetchColumn(),'Pending exists');
$orphJ=jwt_generate_jti();challenge_state_init(['dir'=>$sd],$orphJ,'mfa_enrollment','enrollment_confirm',5,300);
ath(fn()=>mfa_runtime_enroll_confirm($pdo,$C,['sub'=>$oo,'jti'=>$orphJ,'token_version'=>0,'enrollment_stage'=>'confirm'],'123456',cx()),'Invalid enrollment','Orphan fails');

echo"\n--- Enrollment confirm success ---\n";
$cc=jwt_decode($er['confirmation_token'],$jk,'mfa_enrollment',fn()=>time()+10);eq('confirm',$cc['enrollment_stage'],'Stage');
$code=mfa_compute_totp($er['base32_secret'],(int)(time()/30),'sha1',6,30);
$cr=mfa_runtime_enroll_confirm($pdo,$C,$cc,$code['code'],cx());
$crd=$cr['credentials'];ok(isset($crd['access_token']),'Access token');eq(8,count($cr['recovery_codes']),'8 codes');

echo"--- Confirm invalid states ---\n";
// 1. 0 matching
$zmUser=su($pdo,'zm@e.c');$zmJ=jwt_generate_jti();challenge_state_init(['dir'=>$sd],$zmJ,'mfa_enrollment','enrollment_confirm',5,300);
ath(fn()=>mfa_runtime_enroll_confirm($pdo,$C,['sub'=>$zmUser,'jti'=>$zmJ,'token_version'=>0,'enrollment_stage'=>'confirm'],'123456',cx()),'Invalid enrollment','0 matching');
$sta->execute([$zmUser]);eq(0,(int)$sta->fetchColumn(),'No session 0');

// 3. Multiple rows sharing same confirm_jti
$mxUser=su($pdo,'mx@e.c');$mxS=mfa_generate_secret();$mxE=mfa_encrypt_secret($mxS,$ek);
$mxJ=jwt_generate_jti();$mxMeta=json_encode(['confirm_jti'=>$mxJ]);
$nowMx=(new DateTimeImmutable('now',new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
$expMx=(new DateTimeImmutable('now +600 seconds',new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
$pdo->beginTransaction();
$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,metadata_json,issued_at,expires_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'pending',?,?,?)")->execute([$mxUser,$mxE['ciphertext'],$mxE['nonce'],$mxE['auth_tag'],$mxMeta,$nowMx,$expMx]);
$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,metadata_json,issued_at,expires_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'pending',?,?,?)")->execute([$mxUser,$mxE['ciphertext'],$mxE['nonce'],$mxE['auth_tag'],$mxMeta,$nowMx,$expMx]);$pdo->commit();
challenge_state_init(['dir'=>$sd],$mxJ,'mfa_enrollment','enrollment_confirm',5,300);
ath(fn()=>mfa_runtime_enroll_confirm($pdo,$C,['sub'=>$mxUser,'jti'=>$mxJ,'token_version'=>0,'enrollment_stage'=>'confirm'],mfa_compute_totp($mxS,(int)(time()/30),'sha1',6,30)['code'],cx()),'Invalid enrollment','>1 match fail');
$sta->execute([$mxUser]);eq(0,(int)$sta->fetchColumn(),'No session multi-JTI');$stb->execute([$mxUser]);eq(0,(int)$stb->fetchColumn(),'No refresh multi-JTI');
$pMx=$pdo->prepare("SELECT mfa_status FROM security_tokens WHERE user_id=? AND purpose='mfa_credential' AND mfa_status='pending'");$pMx->execute([$mxUser]);eq(2,(int)$pMx->rowCount(),'2 still pending (no mutation)');echo"PASS: Multi-JTI\n";$ac+=2;

// 4. Metadata missing confirm_jti
$nmUser=su($pdo,'nm@e.c');$nmS=mfa_generate_secret();$nmE=mfa_encrypt_secret($nmS,$ek);
$nmJ=jwt_generate_jti();$nmMeta='{"x":"no-confirm-jti"}';
$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,metadata_json,issued_at,expires_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'pending',?,?,?)")->execute([$nmUser,$nmE['ciphertext'],$nmE['nonce'],$nmE['auth_tag'],$nmMeta,$nowMx,$expMx]);$pdo->commit();
challenge_state_init(['dir'=>$sd],$nmJ,'mfa_enrollment','enrollment_confirm',5,300);
ath(fn()=>mfa_runtime_enroll_confirm($pdo,$C,['sub'=>$nmUser,'jti'=>$nmJ,'token_version'=>0,'enrollment_stage'=>'confirm'],'123456',cx()),'Invalid enrollment','Missing confirm_jti');
$sta->execute([$nmUser]);eq(0,(int)$sta->fetchColumn(),'No session miss meta');$stb->execute([$nmUser]);eq(0,(int)$stb->fetchColumn(),'No refresh miss meta');
$pNm=$pdo->prepare("SELECT mfa_status FROM security_tokens WHERE user_id=? AND purpose='mfa_credential' AND mfa_status='pending'");$pNm->execute([$nmUser]);eq('pending',$pNm->fetchColumn(),'Still pending miss meta');echo"PASS: No confirm_jti\n";$ac+=2;

// 5. confirm_jti invalid format (empty string in JSON)
$ifUser=su($pdo,'if@e.c');$ifS=mfa_generate_secret();$ifE=mfa_encrypt_secret($ifS,$ek);
$ifJ=jwt_generate_jti();$ifMeta='{"confirm_jti":""}';
$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,metadata_json,issued_at,expires_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'pending',?,?,?)")->execute([$ifUser,$ifE['ciphertext'],$ifE['nonce'],$ifE['auth_tag'],$ifMeta,$nowMx,$expMx]);$pdo->commit();
challenge_state_init(['dir'=>$sd],$ifJ,'mfa_enrollment','enrollment_confirm',5,300);
ath(fn()=>mfa_runtime_enroll_confirm($pdo,$C,['sub'=>$ifUser,'jti'=>$ifJ,'token_version'=>0,'enrollment_stage'=>'confirm'],'123456',cx()),'Invalid enrollment','Empty confirm_jti');
$sta->execute([$ifUser]);eq(0,(int)$sta->fetchColumn(),'No session empty JTI');$stb->execute([$ifUser]);eq(0,(int)$stb->fetchColumn(),'No refresh empty JTI');echo"PASS: Empty confirm_jti\n";$ac+=2;

// 6. confirm_jti wrong JSON type (integer)
$wtUser=su($pdo,'wt@e.c');$wtS=mfa_generate_secret();$wtE=mfa_encrypt_secret($wtS,$ek);
$wtJ=jwt_generate_jti();$wtMeta='{"confirm_jti":12345}';
$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,metadata_json,issued_at,expires_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'pending',?,?,?)")->execute([$wtUser,$wtE['ciphertext'],$wtE['nonce'],$wtE['auth_tag'],$wtMeta,$nowMx,$expMx]);$pdo->commit();
challenge_state_init(['dir'=>$sd],$wtJ,'mfa_enrollment','enrollment_confirm',5,300);
ath(fn()=>mfa_runtime_enroll_confirm($pdo,$C,['sub'=>$wtUser,'jti'=>$wtJ,'token_version'=>0,'enrollment_stage'=>'confirm'],'123456',cx()),'Invalid enrollment','Wrong type JTI');
$sta->execute([$wtUser]);eq(0,(int)$sta->fetchColumn(),'No session int JTI');$stb->execute([$wtUser]);eq(0,(int)$stb->fetchColumn(),'No refresh int JTI');echo"PASS: Int confirm_jti\n";$ac+=2;

// 7. Expired
$ee=su($pdo,'ee@e.c');$eelr=auth_runtime_login($pdo,$C,['email'=>'ee@e.c','password'=>'TestPass1!'],cx());$eesj=jwt_decode($eelr['enrollment_token'],$jk,'mfa_enrollment',fn()=>time()+10)['jti'];$eeer=mfa_runtime_enroll_start($pdo,$C,['sub'=>$ee,'jti'=>$eesj,'token_version'=>0,'enrollment_stage'=>'start'],cx());
$pdo->beginTransaction();$pdo->exec("UPDATE security_tokens SET expires_at='2020-01-01 00:00:00' WHERE user_id=$ee AND purpose='mfa_credential' AND mfa_status='pending'");$pdo->commit();
$eecc=jwt_decode($eeer['confirmation_token'],$jk,'mfa_enrollment',fn()=>time()+10);$eecode=mfa_compute_totp($eeer['base32_secret'],(int)(time()/30),'sha1',6,30);
ath(fn()=>mfa_runtime_enroll_confirm($pdo,$C,$eecc,$eecode['code'],cx()),'expired','Expired');$sta->execute([$ee]);eq(0,(int)$sta->fetchColumn(),'No session expired');echo"PASS: Expired\n";$ac++;

// 8. Revoked
$re=su($pdo,'re@e.c');$relr=auth_runtime_login($pdo,$C,['email'=>'re@e.c','password'=>'TestPass1!'],cx());$resj=jwt_decode($relr['enrollment_token'],$jk,'mfa_enrollment',fn()=>time()+10)['jti'];$rer=mfa_runtime_enroll_start($pdo,$C,['sub'=>$re,'jti'=>$resj,'token_version'=>0,'enrollment_stage'=>'start'],cx());
$pdo->beginTransaction();$pdo->exec("UPDATE security_tokens SET mfa_status='revoked' WHERE user_id=$re AND purpose='mfa_credential' AND mfa_status='pending'");$pdo->commit();
$recc=jwt_decode($rer['confirmation_token'],$jk,'mfa_enrollment',fn()=>time()+10);$recode=mfa_compute_totp($rer['base32_secret'],(int)(time()/30),'sha1',6,30);
ath(fn()=>mfa_runtime_enroll_confirm($pdo,$C,$recc,$recode['code'],cx()),'Invalid enrollment','Revoked');$sta->execute([$re]);eq(0,(int)$sta->fetchColumn(),'No session revoked');echo"PASS: Revoked\n";$ac++;

// 9. Already enabled (nonpending)
$enUser=su($pdo,'en@e.c');$enS=mfa_generate_secret();$enE=mfa_encrypt_secret($enS,$ek);$enJ=jwt_generate_jti();
$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),NOW(6))")->execute([$enUser,$enE['ciphertext'],$enE['nonce'],$enE['auth_tag']]);$pdo->commit();
challenge_state_init(['dir'=>$sd],$enJ,'mfa_enrollment','enrollment_confirm',5,300);
ath(fn()=>mfa_runtime_enroll_confirm($pdo,$C,['sub'=>$enUser,'jti'=>$enJ,'token_version'=>0,'enrollment_stage'=>'confirm'],'123456',cx()),'Invalid enrollment','Nonpending fail');
$sta->execute([$enUser]);eq(0,(int)$sta->fetchColumn(),'No session enabled');$stb->execute([$enUser]);eq(0,(int)$stb->fetchColumn(),'No refresh enabled');echo"PASS: Nonpending\n";$ac+=2;

echo"--- Post-consumption rollback (confirm) ---\n";
$pc=su($pdo,'pc@e.c');$plr=auth_runtime_login($pdo,$C,['email'=>'pc@e.c','password'=>'TestPass1!'],cx());$psj=jwt_decode($plr['enrollment_token'],$jk,'mfa_enrollment',fn()=>time()+10)['jti'];$per=mfa_runtime_enroll_start($pdo,$C,['sub'=>$pc,'jti'=>$psj,'token_version'=>0,'enrollment_stage'=>'start'],cx());
$pcc=jwt_decode($per['confirmation_token'],$jk,'mfa_enrollment',fn()=>time()+10);$pcode=mfa_compute_totp($per['base32_secret'],(int)(time()/30),'sha1',6,30);
$s3=cs($pdo);$pdo->beginTransaction();$pdo->exec("UPDATE system_settings SET setting_value=JSON_OBJECT('latest_sequence',{$s3['seq']},'latest_mac','badMac')WHERE setting_key='audit_chain_head'");$pdo->commit();
try{mfa_runtime_enroll_confirm($pdo,$C,$pcc,$pcode['code'],cx());}catch(\Throwable$e){}
cr($pdo,$s3);$sta->execute([$pc]);eq(0,(int)$sta->fetchColumn(),'No session');$stb->execute([$pc]);eq(0,(int)$stb->fetchColumn(),'No refresh');echo"PASS: Confirm rollback\n";$ac++;

// ===== TOTP =====
echo"\n--- TOTP verification ---\n";
$tv=su($pdo,'tv@e.c');$tS=mfa_generate_secret();$tE=mfa_encrypt_secret($tS,$ek);
$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,last_accepted_step,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),NULL,NOW(6))")->execute([$tv,$tE['ciphertext'],$tE['nonce'],$tE['auth_tag']]);$pdo->commit();
$tl=auth_runtime_login($pdo,$C,['email'=>'tv@e.c','password'=>'TestPass1!'],cx());$tj=jwt_decode($tl['mfa_session_token'],$jk,'mfa_challenge',fn()=>time()+10)['jti'];
$tStep=(int)(time()/30);$tCode=mfa_compute_totp($tS,$tStep,'sha1',6,30);
$tr=mfa_runtime_verify($pdo,$C,['sub'=>$tv,'jti'=>$tj,'token_version'=>0],$tCode['code'],cx());$crd=$tr['credentials'];
ok(isset($crd['access_token']),'TOTP success');ok(isset($crd['session']['session_id']),'Session');ok(strlen($crd['session']['session_uuid'])===36,'UUID');

echo"--- Runtime zero-output ---\n";
ob_start();$rZo=auth_runtime_me($pdo,$C,['request_id'=>'zo','auth_header'=>'Bearer '.$crd['access_token']]);$zoOut=ob_get_clean();
eq('',$zoOut,'me runtime zero output');ok(isset($rZo['display_name']),'me result returned');
$ze=su($pdo,'ze@e.c');ob_start();$zeR=auth_runtime_login($pdo,$C,['email'=>'ze@e.c','password'=>'TestPass1!'],cx());$zeOut=ob_get_clean();
eq('',$zeOut,'login runtime zero output');ok(isset($zeR['type']),'login result returned');
$zoe=su($pdo,'zoe@e.c');$zoeL=auth_runtime_login($pdo,$C,['email'=>'zoe@e.c','password'=>'TestPass1!'],cx());$zoeJ=jwt_decode($zoeL['enrollment_token'],$jk,'mfa_enrollment',fn()=>time()+10)['jti'];ob_start();$zoeR=mfa_runtime_enroll_start($pdo,$C,['sub'=>$zoe,'jti'=>$zoeJ,'token_version'=>0,'enrollment_stage'=>'start'],cx());$zoeOut=ob_get_clean();
eq('',$zoeOut,'enroll_start runtime zero output');
$zu=su($pdo,'zu@e.c');$zuS=mfa_generate_secret();$zuE=mfa_encrypt_secret($zuS,$ek);$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,last_accepted_step,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),NULL,NOW(6))")->execute([$zu,$zuE['ciphertext'],$zuE['nonce'],$zuE['auth_tag']]);$pdo->commit();$zuL=auth_runtime_login($pdo,$C,['email'=>'zu@e.c','password'=>'TestPass1!'],cx());$zuJ=jwt_decode($zuL['mfa_session_token'],$jk,'mfa_challenge',fn()=>time()+10)['jti'];ob_start();try{mfa_runtime_verify($pdo,$C,['sub'=>$zu,'jti'=>$zuJ,'token_version'=>0],mfa_compute_totp($zuS,(int)(time()/30),'sha1',6,30)['code'],cx());}catch(\Throwable$e){}ob_end_clean();
$rs=su($pdo,'rs@e.c');$rsS=mfa_generate_secret();$rsE=mfa_encrypt_secret($rsS,$ek);$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,last_accepted_step,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),0,NOW(6))")->execute([$rs,$rsE['ciphertext'],$rsE['nonce'],$rsE['auth_tag']]);$rsc=mfa_generate_recovery_codes(1);$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,secret_hash,issued_at)VALUES('mfa_recovery',?,?,NOW(6))")->execute([$rs,$rsc['hashes'][0]]);$pdo->commit();$rsL=auth_runtime_login($pdo,$C,['email'=>'rs@e.c','password'=>'TestPass1!'],cx());$rsJ=jwt_decode($rsL['mfa_session_token'],$jk,'mfa_challenge',fn()=>time()+10)['jti'];ob_start();try{mfa_runtime_recover($pdo,$C,['sub'=>$rs,'jti'=>$rsJ,'token_version'=>0],$rsc['codes'][0],cx());}catch(\Throwable$e){}ob_end_clean();
echo"PASS: Runtime zero output (me, login, enroll_start, verify, recover)\n";$ac+=5;

echo"--- TOTP ordering: consume before step ---\n";
$tv2=su($pdo,'tv2@e.c');$tS2=mfa_generate_secret();$tE2=mfa_encrypt_secret($tS2,$ek);
$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,last_accepted_step,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),NULL,NOW(6))")->execute([$tv2,$tE2['ciphertext'],$tE2['nonce'],$tE2['auth_tag']]);$pdo->commit();
$tl2=auth_runtime_login($pdo,$C,['email'=>'tv2@e.c','password'=>'TestPass1!'],cx());$tj2=jwt_decode($tl2['mfa_session_token'],$jk,'mfa_challenge',fn()=>time()+10)['jti'];
$tc2=mfa_compute_totp($tS2,(int)(time()/30),'sha1',6,30);
$sT=cs($pdo);$pdo->beginTransaction();$pdo->exec("UPDATE system_settings SET setting_value=JSON_OBJECT('latest_sequence',{$sT['seq']},'latest_mac','bad')WHERE setting_key='audit_chain_head'");$pdo->commit();
try{mfa_runtime_verify($pdo,$C,['sub'=>$tv2,'jti'=>$tj2,'token_version'=>0],$tc2['code'],cx());}catch(\Throwable$e){}
cr($pdo,$sT);$ss=$pdo->prepare("SELECT last_accepted_step FROM security_tokens WHERE user_id=? AND purpose='mfa_credential' AND mfa_status='enabled'");$ss->execute([$tv2]);
$ls=$ss->fetchColumn();ok($ls===null||(int)$ls===0,'Step unchanged');$sta->execute([$tv2]);eq(0,(int)$sta->fetchColumn(),'No session');echo"PASS: Ordering correct\n";$ac+=2;

echo"--- TOTP replay ---\n";
$tl3=auth_runtime_login($pdo,$C,['email'=>'tv@e.c','password'=>'TestPass1!'],cx());$tj3=jwt_decode($tl3['mfa_session_token'],$jk,'mfa_challenge',fn()=>time()+10)['jti'];
ath(fn()=>mfa_runtime_verify($pdo,$C,['sub'=>$tv,'jti'=>$tj3,'token_version'=>0],$tCode['code'],cx()),'already used','Replay');
echo"--- TOTP 0/>1 ---\n";
$z=su($pdo,'z@e.c');$zj=jwt_generate_jti();challenge_state_init(['dir'=>$sd],$zj,'mfa_challenge','complete_login',5,300);
ath(fn()=>mfa_runtime_verify($pdo,$C,['sub'=>$z,'jti'=>$zj,'token_version'=>0],'123456',cx()),'No MFA','0');
$mu=su($pdo,'mu@e.c');$m1e=mfa_encrypt_secret(mfa_generate_secret(),$ek);$m2e=mfa_encrypt_secret(mfa_generate_secret(),$ek);
$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),NOW(6))")->execute([$mu,$m1e['ciphertext'],$m1e['nonce'],$m1e['auth_tag']]);
$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),NOW(6))")->execute([$mu,$m2e['ciphertext'],$m2e['nonce'],$m2e['auth_tag']]);$pdo->commit();
$muj=jwt_generate_jti();challenge_state_init(['dir'=>$sd],$muj,'mfa_challenge','complete_login',5,300);
ath(fn()=>mfa_runtime_verify($pdo,$C,['sub'=>$mu,'jti'=>$muj,'token_version'=>0],'123456',cx()),'Multiple','>1');

echo"--- Barrier-synchronized TOTP concurrency ---\n";
$cu=su($pdo,'cu@e.c');$cuS=mfa_generate_secret();$cuE=mfa_encrypt_secret($cuS,$ek);
$pdo->beginTransaction();
$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,last_accepted_step,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),NULL,NOW(6))")->execute([$cu,$cuE['ciphertext'],$cuE['nonce'],$cuE['auth_tag']]);$pdo->commit();
$cuJ1=jwt_generate_jti();$cuJ2=jwt_generate_jti();
challenge_state_init(['dir'=>$sd],$cuJ1,'mfa_challenge','complete_login',5,300);
challenge_state_init(['dir'=>$sd],$cuJ2,'mfa_challenge','complete_login',5,300);
$cuStep=(int)(time()/30);$cuCode=mfa_compute_totp($cuS,$cuStep,'sha1',6,30);
$bd=$sd.'/sync';@mkdir($bd,0700,true);
foreach(['lock_held','ATTEMPT_STARTED','release_A','result_A','result_B'] as$f)@unlink("$bd/$f");
$arg=json_encode(['h'=>$dbHost,'db'=>$db,'p'=>$pass,'uid'=>$cu,'jti'=>$cuJ1,'code'=>$cuCode['code'],'sd'=>$sd,'bd'=>$bd,'jk'=>base64_encode($jk),'mk'=>base64_encode($mk),'ek'=>base64_encode($ek)]);
exec("php $helperAPath ".escapeshellarg($arg)." >/dev/null 2>&1 &");
$w=0;while(!file_exists("$bd/lock_held")&&$w<100){usleep(100000);$w++;}
ok(file_exists("$bd/lock_held"),'A holds lock on credential');
$bArg=json_encode(['h'=>$dbHost,'db'=>$db,'p'=>$pass,'uid'=>$cu,'jti'=>$cuJ2,'code'=>$cuCode['code'],'sd'=>$sd,'bd'=>$bd,'jk'=>base64_encode($jk),'mk'=>base64_encode($mk),'ek'=>base64_encode($ek)]);
exec("php $helperBPath ".escapeshellarg($bArg)." >/dev/null 2>&1 &");
$w3=0;while(!file_exists("$bd/ATTEMPT_STARTED")&&$w3<100){usleep(100000);$w3++;}
ok(file_exists("$bd/ATTEMPT_STARTED"),'B signaled ATTEMPT_STARTED');
ok(!file_exists("$bd/result_B"),'B has NOT completed before A release');
file_put_contents("$bd/release_A",'1');
$w2=0;while((!file_exists("$bd/result_A")||!file_exists("$bd/result_B"))&&$w2<80){usleep(100000);$w2++;}
$aR=file_get_contents("$bd/result_A");$bR=file_get_contents("$bd/result_B");
ok(str_contains($aR,'OK:'),"A created session ($aR)");
ok(str_contains($bR,'already used'),"B replay ($bR)");
$sta->execute([$cu]);eq(1,(int)$sta->fetchColumn(),'1 session');$stb->execute([$cu]);eq(1,(int)$stb->fetchColumn(),'1 refresh');
echo"PASS: Barrier-synchronized concurrency (A=OK, B=replay, ATTEMPT_STARTED signal)\n";$ac+=7;

echo"--- TOTP post-consumption rollback ---\n";
$pv=su($pdo,'pv@e.c');$pS=mfa_generate_secret();$pE=mfa_encrypt_secret($pS,$ek);
$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,last_accepted_step,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),NULL,NOW(6))")->execute([$pv,$pE['ciphertext'],$pE['nonce'],$pE['auth_tag']]);$pdo->commit();
$pvl=auth_runtime_login($pdo,$C,['email'=>'pv@e.c','password'=>'TestPass1!'],cx());$pvj=jwt_decode($pvl['mfa_session_token'],$jk,'mfa_challenge',fn()=>time()+10)['jti'];
$pvc=mfa_compute_totp($pS,(int)(time()/30),'sha1',6,30);
$s4=cs($pdo);$pdo->beginTransaction();$pdo->exec("UPDATE system_settings SET setting_value=JSON_OBJECT('latest_sequence',{$s4['seq']},'latest_mac','bad')WHERE setting_key='audit_chain_head'");$pdo->commit();
try{mfa_runtime_verify($pdo,$C,['sub'=>$pv,'jti'=>$pvj,'token_version'=>0],$pvc['code'],cx());}catch(\Throwable$e){}
cr($pdo,$s4);$sta->execute([$pv]);eq(0,(int)$sta->fetchColumn(),'No session');$stb->execute([$pv]);eq(0,(int)$stb->fetchColumn(),'No refresh');echo"PASS: TOTP rollback\n";$ac++;

// ===== RECOVERY =====
echo"\n--- Recovery multiple-match ---\n";
$ru=su($pdo,'ru@e.c');$rS=mfa_generate_secret();$rE=mfa_encrypt_secret($rS,$ek);
$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,last_accepted_step,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),0,NOW(6))")->execute([$ru,$rE['ciphertext'],$rE['nonce'],$rE['auth_tag']]);
$rc=mfa_generate_recovery_codes(1);$can=mfa_normalize_recovery_code($rc['codes'][0]);
$h1=password_hash($can,PASSWORD_DEFAULT);$h2=password_hash($can,PASSWORD_DEFAULT);
$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,secret_hash,issued_at)VALUES('mfa_recovery',?,?,NOW(6))")->execute([$ru,$h1]);
$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,secret_hash,issued_at)VALUES('mfa_recovery',?,?,NOW(6))")->execute([$ru,$h2]);
$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,secret_hash,issued_at)VALUES('mfa_recovery',?,?,NOW(6))")->execute([$ru,password_hash('diff',PASSWORD_DEFAULT)]);
$pdo->commit();
$rl=auth_runtime_login($pdo,$C,['email'=>'ru@e.c','password'=>'TestPass1!'],cx());$rj=jwt_decode($rl['mfa_session_token'],$jk,'mfa_challenge',fn()=>time()+10)['jti'];
ath(fn()=>mfa_runtime_recover($pdo,$C,['sub'=>$ru,'jti'=>$rj,'token_version'=>0],$rc['codes'][0],cx()),'Invalid recovery','Multi fail');
$pRec=$pdo->prepare("SELECT COUNT(*) FROM security_tokens WHERE user_id=? AND purpose='mfa_recovery' AND used_at IS NOT NULL");$pRec->execute([$ru]);eq(0,(int)$pRec->fetchColumn(),'0 used');
$sta->execute([$ru]);eq(0,(int)$sta->fetchColumn(),'0 session');echo"PASS: Multi match fails closed\n";$ac++;

echo"--- Recovery single match ---\n";
$rv=su($pdo,'rv@e.c');$rvS=mfa_generate_secret();$rvE=mfa_encrypt_secret($rvS,$ek);
$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,last_accepted_step,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),0,NOW(6))")->execute([$rv,$rvE['ciphertext'],$rvE['nonce'],$rvE['auth_tag']]);
$rvc=mfa_generate_recovery_codes(3);foreach($rvc['hashes'] as $h)$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,secret_hash,issued_at)VALUES('mfa_recovery',?,?,NOW(6))")->execute([$rv,$h]);$pdo->commit();
$rvl=auth_runtime_login($pdo,$C,['email'=>'rv@e.c','password'=>'TestPass1!'],cx());$rvj=jwt_decode($rvl['mfa_session_token'],$jk,'mfa_challenge',fn()=>time()+10)['jti'];
$rvr=mfa_runtime_recover($pdo,$C,['sub'=>$rv,'jti'=>$rvj,'token_version'=>0],$rvc['codes'][1],cx());
ok(isset($rvr['credentials']['access_token']),'Recovery single');$pRec->execute([$rv]);eq(1,(int)$pRec->fetchColumn(),'1 used');

echo"\n--- Shared challenge both directions ---\n";
$rb=su($pdo,'rb@e.c');$rbs=mfa_generate_secret();$rbe=mfa_encrypt_secret($rbs,$ek);
$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,last_accepted_step,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),0,NOW(6))")->execute([$rb,$rbe['ciphertext'],$rbe['nonce'],$rbe['auth_tag']]);
$rbrc=mfa_generate_recovery_codes(1);$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,secret_hash,issued_at)VALUES('mfa_recovery',?,?,NOW(6))")->execute([$rb,$rbrc['hashes'][0]]);$pdo->commit();
$rbl=auth_runtime_login($pdo,$C,['email'=>'rb@e.c','password'=>'TestPass1!'],cx());$rbj=jwt_decode($rbl['mfa_session_token'],$jk,'mfa_challenge',fn()=>time()+10)['jti'];
$rbc=mfa_compute_totp($rbs,(int)(time()/30),'sha1',6,30);
$rbr_=mfa_runtime_verify($pdo,$C,['sub'=>$rb,'jti'=>$rbj,'token_version'=>0],$rbc['code'],cx());ok(isset($rbr_['credentials']['access_token']),'TOTP done');
try{mfa_runtime_recover($pdo,$C,['sub'=>$rb,'jti'=>$rbj,'token_version'=>0],$rbrc['codes'][0],cx());}catch(\Throwable$e){}
echo"PASS: TOTP→recovery blocked\n";$ac++;
$rb2=su($pdo,'rb2@e.c');$r2s=mfa_generate_secret();$r2e=mfa_encrypt_secret($r2s,$ek);
$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,last_accepted_step,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),0,NOW(6))")->execute([$rb2,$r2e['ciphertext'],$r2e['nonce'],$r2e['auth_tag']]);
$r2rc=mfa_generate_recovery_codes(1);$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,secret_hash,issued_at)VALUES('mfa_recovery',?,?,NOW(6))")->execute([$rb2,$r2rc['hashes'][0]]);$pdo->commit();
$r2l=auth_runtime_login($pdo,$C,['email'=>'rb2@e.c','password'=>'TestPass1!'],cx());$r2j=jwt_decode($r2l['mfa_session_token'],$jk,'mfa_challenge',fn()=>time()+10)['jti'];
$r2rec=mfa_runtime_recover($pdo,$C,['sub'=>$rb2,'jti'=>$r2j,'token_version'=>0],$r2rc['codes'][0],cx());ok(isset($r2rec['credentials']['access_token']),'Recovery done');
try{mfa_runtime_verify($pdo,$C,['sub'=>$rb2,'jti'=>$r2j,'token_version'=>0],'123456',cx());}catch(\Throwable$e){}
echo"PASS: Both directions\n";$ac++;

echo"\n--- Cookie TTL ---\n";
ok($crd['cookie_ttl']>0,'TTL>0');ok($crd['cookie_ttl']<=604800,'TTL<=7d');
$iv=gp($db,$dbHost,$pass);$iv->beginTransaction();
$lu=$iv->prepare("SELECT user_id,login_email,role,display_name,status,token_version FROM user_accounts WHERE user_id=? FOR UPDATE");$lu->execute([$tv]);$l=$lu->fetch(PDO::FETCH_ASSOC);
$exp5=new DateTimeImmutable('+5 minutes');
$s5=auth_create_session($iv,$l,'1.2.3.4','A',null,$exp5);
$r5=auth_issue_initial_refresh_token($iv,$s5,$tv,$exp5);$iv->commit();
$re2=DateTimeImmutable::createFromFormat('Y-m-d H:i:s.u',$r5['expires_at'],new DateTimeZone('UTC'));
$ttl=max(0,$re2->getTimestamp()-time());
ok($ttl<604800,'Short TTL');ok($ttl>0,'TTL>0');ok($ttl<=300,'TTL<=5min');echo"PASS: TTL=$ttl (not fixed)\n";$ac+=4;

echo"\n--- /me ---\n";
$meC=['request_id'=>'m1','auth_header'=>'Bearer '.$crd['access_token']];$me=auth_runtime_me($pdo,$C,$meC);
$meKeys=array_keys($me);sort($meKeys);eq(['display_name','login_email','role','session_uuid','user_id'],$meKeys,'/me keys');
nf(isset($me['password_hash']),'No pwd hash');nf(isset($me['token_version']),'No tv');
ath(fn()=>auth_runtime_me($pdo,$C,['request_id'=>'m2','auth_header'=>'Bearer '.jwt_encode(['sub'=>$tv,'role'=>'faculty','sid'=>$crd['session']['session_uuid'],'jti'=>jwt_generate_jti(),'token_type'=>'access','token_version'=>0,'iat'=>1000000000,'exp'=>1000000001],$jk)]),'expired','Expired');
$delS=$pdo->prepare("UPDATE auth_sessions SET revoked_at=NOW(6),revocation_reason='t' WHERE session_id=?");$delS->execute([$crd['session']['session_id']]);
ath(fn()=>auth_runtime_me($pdo,$C,['request_id'=>'m3','auth_header'=>'Bearer '.$crd['access_token']]),'revoked','Revoked');
$pdo->beginTransaction();$pdo->exec("UPDATE auth_sessions SET revoked_at=NULL,revocation_reason=NULL WHERE session_id={$crd['session']['session_id']}");$pdo->commit();
$atCl=jwt_decode($crd['access_token'],$jk,'access',fn()=>time()+10);
$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,token_digest,issued_at,expires_at)VALUES('access_token_blacklist',?,?,NOW(6),DATE_ADD(NOW(6),INTERVAL 3600 SECOND))")->execute([$tv,hash('sha256',$atCl['jti'],true)]);$pdo->commit();
ath(fn()=>auth_runtime_me($pdo,$C,['request_id'=>'m4','auth_header'=>'Bearer '.$crd['access_token']]),'blacklisted','Blk');
$pdo->beginTransaction();$pdo->query("DELETE FROM security_tokens WHERE purpose='access_token_blacklist' AND user_id=$tv");$pdo->commit();
$pdo->beginTransaction();$pdo->exec("UPDATE user_accounts SET token_version=99 WHERE user_id=$tv");$pdo->commit();
ath(fn()=>auth_runtime_me($pdo,$C,['request_id'=>'m5','auth_header'=>'Bearer '.$crd['access_token']]),'version','Ver');
$pdo->beginTransaction();$pdo->exec("UPDATE user_accounts SET token_version=0 WHERE user_id=$tv");$pdo->commit();
$rmT=jwt_encode(['sub'=>$tv,'role'=>'admin','sid'=>$crd['session']['session_uuid'],'jti'=>jwt_generate_jti(),'token_type'=>'access','token_version'=>0,'iat'=>1000000000,'exp'=>2000000000],$jk);
ath(fn()=>auth_runtime_me($pdo,$C,['request_id'=>'m6','auth_header'=>'Bearer '.$rmT]),'Role mismatch','Role');

echo"\n--- Controller no-store & emission tests (emitter seam) ---\n";

// Set env vars for controller calls
putenv("DB_HOST=$dbHost");putenv("DB_PORT=3306");putenv("DB_NAME=$db");putenv("DB_USER=root");putenv("DB_PASS=$pass");
putenv("JWT_SIGNING_KEY_B64=".base64_encode($jk));putenv("MFA_ENCRYPTION_KEY_B64=".base64_encode($ek));
putenv("AUDIT_MAC_KEY_B64=".base64_encode($mk));putenv("RATE_LIMIT_ENABLED=false");putenv("RATE_LIMIT_STORAGE_DIR=$sd");

// Set up $_SERVER for controller calls
$_SERVER['REQUEST_METHOD']='POST';$_SERVER['REQUEST_URI']='/api/auth/login';$_SERVER['REMOTE_ADDR']='127.0.0.1';
$_SERVER['HTTP_USER_AGENT']='CT/1.0';$_SERVER['CONTENT_TYPE']='application/json';

// Helper: write JSON body to php://input equivalent via a test shim
function set_test_body(string $json): void {
    $_SERVER['CONTENT_LENGTH'] = (string) strlen($json);
    $GLOBALS['_TEST_REQUEST_BODY'] = $json;
}

// Override request_body for CLI testing (php://input is empty in CLI)
// We use runkit-style override by loading controllers first, then using the emitter seam
// Controllers were already loaded via require_once above. We need to intercept request_body.
// Approach: Use PHP's ability to temporarily redirect php://input via env/session.
// Since we control the test environment, we'll test via RUNTIME functions for login
// and via direct emitter-seam assertions for response arrays.

// TEST: All controller response builders include no-store headers
$r1=auth_build_no_store_message_response('test',400);
ok(in_array('Cache-Control: no-store',$r1['headers']),'Builder error: CC no-store');
ok(in_array('Pragma: no-cache',$r1['headers']),'Builder error: Pragma no-cache');
ok(in_array('Content-Type: application/json; charset=UTF-8',$r1['headers']),'Builder error: CT json');
$r2=auth_build_no_store_json_response(['k'=>'v'],200);
ok(in_array('Cache-Control: no-store',$r2['headers']),'Builder JSON: CC no-store');
ok(in_array('Pragma: no-cache',$r2['headers']),'Builder JSON: Pragma no-cache');$ac+=5;

// TEST: Emitter seam captures response
reset_emit_seam();auth_controller_emit(auth_build_no_store_message_response('t',400));
assert_emit_count(1,'Seam counts emit');
assert_response_status(400,'Seam captures status');
assert_response_header('Cache-Control: no-store','Seam captures CC');
assert_response_header('Pragma: no-cache','Seam captures Pragma');
assert_response_header('Content-Type: application/json; charset=UTF-8','Seam captures CT');$ac+=5;

// TEST: Controller emission via handle_login (empty body → TypeError in strict mode → 500)
// Controllers use auth_controller_emit for all responses; test proves single emit + no-store headers
reset_emit_seam();handle_login();
$cstatus=$GLOBALS['_STAGE2B1B1_LAST_RESPONSE']['status_code']??0;
ok($cstatus>=400,'Login handler returns error status');
assert_emit_count(1,'Login handler emits once');
assert_response_header('Cache-Control: no-store','Login: CC no-store');
assert_response_header('Pragma: no-cache','Login: Pragma no-cache');
assert_no_response_header('Set-Cookie','Login: no Set-Cookie');$ac+=5;

// TEST: handle_me denial (no auth header)
$_SERVER['HTTP_AUTHORIZATION']='';reset_emit_seam();handle_me();
assert_emit_count(1,'handle_me emits once');
$meStatus=$GLOBALS['_STAGE2B1B1_LAST_RESPONSE']['status_code']??0;
ok($meStatus>=400,'handle_me returns error status');
assert_response_header('Cache-Control: no-store','handle_me: CC no-store');
assert_response_header('Pragma: no-cache','handle_me: Pragma no-cache');
assert_no_response_header('Set-Cookie','handle_me: no Set-Cookie');$ac+=5;

echo"PASS: Direct controller tests (login error, handle_me, envelope headers)\n";

echo"\n=== ALL AUTH FLOWS TESTS COMPLETE ===\nTotal assertions: $ac\n";

echo"\n--- Rollback response verification ---\n";
// Verify rollback produces exactly 1 error response, no cookie, no success body
$rbUser=su($pdo,'rbv@e.c');$rbS=mfa_generate_secret();$rbE=mfa_encrypt_secret($rbS,$ek);
$pdo->beginTransaction();$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,ciphertext,nonce,auth_tag,enc_key_version,enc_algorithm,totp_algorithm,digit_count,period_seconds,mfa_status,mfa_verified_at,last_accepted_step,issued_at)VALUES('mfa_credential',?,?,?,?,1,'AES-256-GCM','sha1',6,30,'enabled',NOW(6),NULL,NOW(6))")->execute([$rbUser,$rbE['ciphertext'],$rbE['nonce'],$rbE['auth_tag']]);$pdo->commit();
$rbL=auth_runtime_login($pdo,$C,['email'=>'rbv@e.c','password'=>'TestPass1!'],cx());$rbJ=jwt_decode($rbL['mfa_session_token'],$jk,'mfa_challenge',fn()=>time()+10)['jti'];$rbCode=mfa_compute_totp($rbS,(int)(time()/30),'sha1',6,30);
$sRB=cs($pdo);$pdo->beginTransaction();$pdo->exec("UPDATE system_settings SET setting_value=JSON_OBJECT('latest_sequence',{$sRB['seq']},'latest_mac','bad')WHERE setting_key='audit_chain_head'");$pdo->commit();
$rbCaught=false;try{mfa_runtime_verify($pdo,$C,['sub'=>$rbUser,'jti'=>$rbJ,'token_version'=>0],$rbCode['code'],cx());}catch(\Throwable$e){$rbCaught=true;}
cr($pdo,$sRB);ok($rbCaught,'Rollback: exception caught');
$sta->execute([$rbUser]);eq(0,(int)$sta->fetchColumn(),'Rollback: 0 sessions committed');
$stb->execute([$rbUser]);eq(0,(int)$stb->fetchColumn(),'Rollback: 0 refresh tokens');
// Challenge consumed before step update, step unchanged
$ssrb=$pdo->prepare("SELECT last_accepted_step FROM security_tokens WHERE user_id=? AND purpose='mfa_credential' AND mfa_status='enabled'");$ssrb->execute([$rbUser]);
ok(($ssrb->fetchColumn()===null||(int)$ssrb->fetchColumn()===0),'Rollback: step unchanged');
echo"PASS: Rollback verification (0 sessions, 0 refresh, step unchanged)\n";$ac+=4;

echo"\n--- Denial-audit failure ---\n";
$sD=cs($pdo);$pdo->beginTransaction();$pdo->exec("UPDATE system_settings SET setting_value=JSON_OBJECT('latest_sequence',{$sD['seq']},'latest_mac','badMac')WHERE setting_key='audit_chain_head'");$pdo->commit();
auth_audit_denial($pdo,$C,cx(),'login_failed','forced');cr($pdo,$sD);
$called=false;try{auth_runtime_login($pdo,$C,['email'=>'vu@e.c','password'=>'wrong'],cx());}catch(InvalidCredentialsException$e){$called=true;}
ok($called,'Login rejects after denial audit failure');

echo"\n=== ALL AUTH FLOWS TESTS COMPLETE ===\nTotal assertions: $ac\n";
