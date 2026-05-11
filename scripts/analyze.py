import os
import sys
from google import genai

# 1. Authenticate using the environment variable
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    print("Error: GEMINI_API_KEY environment variable is missing.")
    sys.exit(1)

# Initialize the new client
client = genai.Client(api_key=api_key)

# 2. Require a target file as an argument
if len(sys.argv) < 2:
    print("Usage: python scripts/analyze.py <path_to_file>")
    sys.exit(1)

target_file = sys.argv[1]

# 3. Read the file. The 'r' parameter strictly enforces read-only access.
try:
    with open(target_file, 'r', encoding='utf-8') as file:
        file_content = file.read()
except FileNotFoundError:
    print(f"Error: The file {target_file} does not exist.")
    sys.exit(1)
except Exception as e:
    print(f"File read error: {e}")
    sys.exit(1)

# 4. Construct the strict analytical prompt
prompt = (
    f"You are a forensic code auditor analyzing the AIntegrity repository. "
    f"Review the following code from {target_file} for syntax errors, logical flaws, or inefficiencies. "
    f"CRITICAL CONSTRAINT: Do not audit or recommend changes to npm package versions, SDK alignments, or peer dependencies. Assume all versions are strictly correct for the 2026 build environment. "
    f"Provide the analysis and specific line corrections for code logic only. Do not execute code.\n\n"
    f"```\n{file_content}\n```"
)

# 5. Transmit to the API and print the response
print(f"Analyzing {target_file}...")

try:
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt
    )
    print("\n--- AIntegrity Analysis Report ---\n")
    print(response.text)
    print("\n----------------------------------\n")
except Exception as e:
    print(f"API interaction failed: {e}")
