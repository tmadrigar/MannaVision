from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
import base64
from io import BytesIO

# --- PLANO B: COLOQUE SUA CHAVE DA HUGGING FACE AQUI ---
# Substitua pela sua chave que começa com "hf_..."
# Esta é a maneira mais fácil de garantir que funcione.
os.environ["HUGGING_FACE_TOKEN"] = "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"
# ----------------------------------------------------

# --- CÓDIGO DE DEBUG ---
api_token = os.getenv("HUGGING_FACE_TOKEN")
print("=================================================")
print("--- VERIFICANDO TOKEN DA API HUGGING FACE ---")
if api_token:
    print(f"--- SUCESSO: Token encontrado! Começa com: {api_token[:5]}...")
else:
    print("--- FALHA: Token NÃO FOI ENCONTRADO! Coloque a chave no código acima.")
print("=================================================")
# --- FIM DO CÓDIGO DE DEBUG ---


app = Flask(__name__)
CORS(app)

# URL da API para um modelo popular de geração de imagem (Stable Diffusion)
API_URL = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0"


# Se o modelo acima estiver sobrecarregado, você pode tentar outros, como:
# API_URL = "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5"


@app.route('/generate', methods=['POST'])
def generate_image():
    try:
        data = request.json
        prompt = data.get('prompt')

        if not prompt:
            return jsonify({"error": "Prompt é necessário."}), 400

        api_key = os.getenv("HUGGING_FACE_TOKEN")
        if not api_key:
            return jsonify({"error": "Chave da API da Hugging Face não configurada no servidor."}), 500

        headers = {"Authorization": f"Bearer {api_key}"}

        payload = {"inputs": prompt}

        # Fazendo a chamada para a API da Hugging Face
        print(f"Enviando prompt para Hugging Face: '{prompt}'")
        response = requests.post(API_URL, headers=headers, json=payload)

        # A API da Hugging Face retorna a imagem diretamente como 'bytes'
        if response.status_code == 200:
            print("Sucesso! Imagem recebida da Hugging Face.")
            # Converte os bytes da imagem para uma string base64 que o navegador entende
            img_bytes = BytesIO(response.content)
            base64_string = base64.b64encode(img_bytes.read()).decode('utf-8')
            image_data_url = f"data:image/jpeg;base64,{base64_string}"

            return jsonify({"imageUrl": image_data_url})
        else:
            # Se der erro, mostra a resposta da API para depuração
            error_message = response.json().get("error", "Erro desconhecido da API")
            print(f"Erro da API Hugging Face: {error_message}")
            if "currently loading" in error_message:
                return jsonify({
                                   "error": "O modelo de IA está sendo carregado no servidor da Hugging Face, por favor, tente novamente em 20 segundos."}), 503

            return jsonify({"error": f"Erro da API: {error_message}"}), response.status_code

    except Exception as e:
        print(f"Ocorreu um erro no backend: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)