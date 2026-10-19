"""A stand-in for an OpenAI-compatible model, so the assistant can be tested
end to end with predictable answers. It reads the user's last message and the
data snapshot in the system prompt, and replies in the JSON format the
backend asks for:

- "car insurance": proposes a $1,200/year expense, plus an update to a record
  that doesn't exist (which the backend must drop).
- anything else: answers from the data, listing the items it can see.
"""
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer


def reply_for(messages):
    last = messages[-1]["content"].lower()
    data = json.loads(messages[0]["content"].split("The user's data (JSON):\n", 1)[1])
    if "car insurance" in last:
        return {
            "reply": "I'll add car insurance as a yearly expense of $1,200.",
            "actions": [
                {"type": "createItem", "fields": {"category": "expenses", "name": "Car insurance",
                                                  "amount": 1200, "frequency": "yearly"}},
                {"type": "updateItem", "id": "no-such-item", "fields": {"amount": 1}},
            ],
        }
    names = sorted(item["name"] for item in data["items"])
    return {"reply": f"You have {len(names)} items: {', '.join(names)}.", "actions": []}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        content = json.dumps(reply_for(body["messages"]))
        response = json.dumps({
            "id": "stand-in", "object": "chat.completion", "model": "stand-in",
            "choices": [{"index": 0, "finish_reason": "stop",
                         "message": {"role": "assistant", "content": content}}],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    HTTPServer((os.environ.get("HOST", "0.0.0.0"), int(os.environ.get("PORT", "8000"))), Handler).serve_forever()
