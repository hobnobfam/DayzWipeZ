import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
const publicDir = path.join(__dirname, "public");
const publicIndex = path.join(publicDir, "index.html");
const rootIndex = path.join(__dirname, "index.html");
const fs = await import("fs");

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
} else {
  app.use(express.static(__dirname));
}

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-in-production";

if (!DATABASE_URL) console.warn("DATABASE_URL is not set. The app cannot store community data until a PostgreSQL database is configured.");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized:false }
});

async function db(query, params=[]){ if(!DATABASE_URL) throw new Error("Database is not configured"); return pool.query(query,params); }

async function init(){
 if(!DATABASE_URL) return;
 await db(`CREATE TABLE IF NOT EXISTS users(
   id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL,
   password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner', created_at TIMESTAMPTZ DEFAULT NOW()
 )`);
 await db(`CREATE TABLE IF NOT EXISTS servers(
   id SERIAL PRIMARY KEY, owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
   name TEXT NOT NULL, platform TEXT NOT NULL, region TEXT NOT NULL,
   description TEXT DEFAULT '', discord_url TEXT DEFAULT '', website_url TEXT DEFAULT '',
   approved BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW()
 )`);
 await db(`CREATE TABLE IF NOT EXISTS wipes(
   id SERIAL PRIMARY KEY, server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
   wipe_date DATE NOT NULL, wipe_type TEXT NOT NULL, notes TEXT DEFAULT '',
   approved BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW()
 )`);
}

function auth(req,res,next){
 try{
  const h=req.headers.authorization||"";
  if(!h.startsWith("Bearer ")) return res.status(401).json({error:"Login required"});
  req.user=jwt.verify(h.slice(7),JWT_SECRET); next();
 }catch{res.status(401).json({error:"Invalid or expired login"});}
}

function admin(req,res,next){ if(req.user?.role!=="admin") return res.status(403).json({error:"Admin only"}); next(); }

app.post("/api/register",async(req,res)=>{
 try{
  const {username,email,password}=req.body;
  if(!username||!email||!password||password.length<8) return res.status(400).json({error:"Username, email and an 8+ character password are required"});
  const hash=await bcrypt.hash(password,12);
  const r=await db("INSERT INTO users(username,email,password_hash) VALUES($1,$2,$3) RETURNING id,username,email,role",[username.trim(),email.trim().toLowerCase(),hash]);
  const u=r.rows[0], token=jwt.sign(u,JWT_SECRET,{expiresIn:"7d"});
  res.json({token,user:u});
 }catch(e){res.status(400).json({error:e.code==="23505"?"Username or email already exists":"Registration failed"});}
});

app.post("/api/login",async(req,res)=>{
 try{
  const {email,password}=req.body;
  const r=await db("SELECT * FROM users WHERE email=$1",[email?.trim().toLowerCase()]);
  const u=r.rows[0];
  if(!u||!(await bcrypt.compare(password||"",u.password_hash))) return res.status(401).json({error:"Incorrect email or password"});
  const safe={id:u.id,username:u.username,email:u.email,role:u.role};
  res.json({token:jwt.sign(safe,JWT_SECRET,{expiresIn:"7d"}),user:safe});
 }catch{res.status(500).json({error:"Login failed"});}
});

app.get("/api/me",auth,(req,res)=>res.json(req.user));

app.get("/api/wipes",async(req,res)=>{
 try{
  const {from,to,platform,region,q}=req.query;
  const params=[]; const where=["w.approved=true","s.approved=true"];
  if(from){params.push(from);where.push(`w.wipe_date >= $${params.length}`)}
  if(to){params.push(to);where.push(`w.wipe_date <= $${params.length}`)}
  if(platform){params.push(platform);where.push(`s.platform=$${params.length}`)}
  if(region){params.push(region);where.push(`s.region=$${params.length}`)}
  if(q){params.push("%"+q+"%");where.push(`s.name ILIKE $${params.length}`)}
  const r=await db(`SELECT w.id,w.wipe_date,w.wipe_type,w.notes,s.id server_id,s.name, s.platform,s.region,s.description,s.discord_url,s.website_url
                    FROM wipes w JOIN servers s ON s.id=w.server_id WHERE ${where.join(" AND ")}
                    ORDER BY w.wipe_date ASC`,params);
  res.json(r.rows);
 }catch(e){res.status(500).json({error:"Could not load wipes"});}
});

app.post("/api/servers",auth,async(req,res)=>{
 try{
  const {name,platform,region,description,discord_url,website_url}=req.body;
  if(!name||!platform||!region) return res.status(400).json({error:"Server name, platform and region are required"});
  const r=await db(`INSERT INTO servers(owner_id,name,platform,region,description,discord_url,website_url)
                   VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
                   [req.user.id,name.trim(),platform,region,description||"",discord_url||"",website_url||""]);
  res.json({server:r.rows[0],message:"Server submitted for approval"});
 }catch{res.status(500).json({error:"Could not submit server"});}
});

app.post("/api/servers/:id/wipes",auth,async(req,res)=>{
 try{
  const s=await db("SELECT * FROM servers WHERE id=$1 AND owner_id=$2",[req.params.id,req.user.id]);
  if(!s.rows[0]) return res.status(404).json({error:"Server not found"});
  const {wipe_date,wipe_type,notes}=req.body;
  if(!wipe_date||!wipe_type) return res.status(400).json({error:"Date and wipe type are required"});
  const r=await db(`INSERT INTO wipes(server_id,wipe_date,wipe_type,notes) VALUES($1,$2,$3,$4) RETURNING *`,
    [req.params.id,wipe_date,wipe_type,notes||""]);
  res.json({wipe:r.rows[0],message:"Wipe submitted for approval"});
 }catch{res.status(500).json({error:"Could not submit wipe"});}
});

app.get("/api/owner/servers",auth,async(req,res)=>{
 const r=await db("SELECT * FROM servers WHERE owner_id=$1 ORDER BY created_at DESC",[req.user.id]);
 res.json(r.rows);
});

app.get("/api/admin/pending",auth,admin,async(req,res)=>{
 const servers=await db(`SELECT s.*,u.username FROM servers s JOIN users u ON u.id=s.owner_id WHERE s.approved=false ORDER BY s.created_at`);
 const wipes=await db(`SELECT w.*,s.name server_name FROM wipes w JOIN servers s ON s.id=w.server_id WHERE w.approved=false ORDER BY w.wipe_date`);
 res.json({servers:servers.rows,wipes:wipes.rows});
});

app.post("/api/admin/servers/:id/approve",auth,admin,async(req,res)=>{
 await db("UPDATE servers SET approved=true WHERE id=$1",[req.params.id]); res.json({ok:true});
});
app.post("/api/admin/wipes/:id/approve",auth,admin,async(req,res)=>{
 await db("UPDATE wipes SET approved=true WHERE id=$1",[req.params.id]); res.json({ok:true});
});
app.delete("/api/admin/servers/:id",auth,admin,async(req,res)=>{
 await db("DELETE FROM servers WHERE id=$1",[req.params.id]); res.json({ok:true});
});

app.get("*",(req,res)=>{
  const indexFile = fs.existsSync(publicIndex) ? publicIndex : rootIndex;
  res.sendFile(indexFile);
});

init().then(()=>app.listen(PORT,()=>console.log(`DayZ Wipe Calendar running on ${PORT}`)))
.catch(e=>{console.error(e);process.exit(1)});
