"""
Test navigateur de la couche hors ligne : vrai IndexedDB, fermeture/réouverture de la page.
Usage : python3 tests/browser/run.py <dossier_avec_smoke.js>
"""
import http.server, socketserver, sys, threading, os, functools
from playwright.sync_api import sync_playwright

folder = sys.argv[1]
os.chdir(folder)
open("index.html", "w").write('<!doctype html><meta charset="utf-8"><title>smoke</title><script src="smoke.js"></script>')

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=folder)
handler.log_message = lambda *a, **k: None
server = socketserver.TCPServer(("127.0.0.1", 0), handler)
port = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{port}/index.html"

def check(label, ok, detail=""):
    print(("OK   " if ok else "ECHEC"), label, detail)
    if not ok:
        raise SystemExit(1)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
    context = browser.new_context()
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)

    # --- Session 1 : en ligne, copie des données, puis le réseau coupe ---
    page.evaluate("smoke.init()")
    check("copie des données", page.evaluate("smoke.syncReplica()") is True)
    check("copie prête", page.evaluate("smoke.replicaReady()") is True)

    page.evaluate("smoke.setServerDown(true)")
    created = page.evaluate("smoke.createClass('5e B')")
    check("création hors ligne confirmée", created["status"] == 201 and created["data"]["name"] == "5e B", str(created["status"]))
    class_id = created["data"]["id"]
    check("élève dans la nouvelle classe", page.evaluate(f"smoke.createStudent('{class_id}', 'DOSSOU')") == 201)
    check("2 modifications en attente", page.evaluate("smoke.pending()") == 2)
    check("liste immédiate", page.evaluate("smoke.listClasses()") == ["5e B", "6e A"])

    # --- Fermeture et réouverture de l'application ---
    page.reload()
    page.evaluate("smoke.init()")
    page.evaluate("smoke.setServerDown(true)")
    check("modifications conservées après rechargement", page.evaluate("smoke.pending()") == 2)
    check("données conservées après rechargement", page.evaluate("smoke.listClasses()") == ["5e B", "6e A"])
    check("élève conservé après rechargement", page.evaluate(f"smoke.listStudents('{class_id}')") == ["DOSSOU"])
    check("le serveur n'a encore rien reçu", page.evaluate("smoke.serverClasses()") == ["6e A"])

    # --- Retour du réseau ---
    page.evaluate("smoke.setServerDown(false)")
    result = page.evaluate("smoke.flush()")
    check("envoi complet", result == {"sent": 2, "failed": 0, "stopped": None}, str(result))
    check("file vide", page.evaluate("smoke.pending()") == 0)
    check("classe reçue par le serveur", page.evaluate("smoke.serverClasses()") == ["5e B", "6e A"])
    check("élève reçu par le serveur", page.evaluate("smoke.serverStudents()") == ["AGBO", "DOSSOU"])

    # --- Après un nouveau rechargement, plus rien à envoyer ---
    page.reload()
    page.evaluate("smoke.init()")
    check("rien à renvoyer après rechargement", page.evaluate("smoke.pending()") == 0)

    check("aucune erreur JavaScript", errors == [], str(errors))
    browser.close()

print("Test navigateur : tout est bon.")
