"""Flask 入口 · 同时承担 web/ 静态文件托管"""
from pathlib import Path
from flask import Flask, send_from_directory
from api import api

ROOT = Path(__file__).resolve().parent.parent
WEB  = ROOT / "web"

app = Flask(__name__, static_folder=None)
app.register_blueprint(api)

@app.get("/")
def index():
    return send_from_directory(WEB, "index.html")

@app.get("/assets/<path:fn>")
def assets(fn):
    return send_from_directory(WEB / "assets", fn)

@app.get("/data/<path:fn>")
def data_files(fn):
    return send_from_directory(WEB / "data", fn)

@app.get("/healthz")
def healthz():
    return {"ok": True}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=False)
