import os
from llama_cpp import Llama

class Rewriter:
    """Query rewriter using Qwen 2.5 0.5B for fixing typos and clarifying intent"""
    
    def __init__(self, model_path, enabled=True):
        self.enabled = enabled
        
        if not self.enabled:
            print("[INFO] Rewriter disabled in config")
            self.llm = None
            return
        
        # Check if model file exists
        if not model_path or not os.path.exists(model_path):
            print(f"[WARN] Rewriter model not found at: {model_path}")
            print("[INFO] Rewriter disabled, using original queries")
            self.enabled = False
            self.llm = None
            return
        
        try:
            self.llm = Llama(
                model_path=model_path,
                n_ctx=512,
                n_threads=4,
                n_gpu_layers=0,
                verbose=False,
            )
            print(f"[INFO] Qwen Rewriter loaded: {os.path.basename(model_path)}")
        except Exception as e:
            print(f"[ERROR] Failed to load rewriter: {e}")
            print("[INFO] Rewriter disabled, using original queries")
            self.enabled = False
            self.llm = None

    def rewrite(self, user_input):
        """Rewrite user query, fallback to original if disabled"""
        
        if not self.enabled or self.llm is None:
            return user_input
        
        if len(user_input.strip()) < 3:
            return user_input
        
        try:
            # In rewriter.py

            prompt = f"""<|im_start|>system
Task: Search Query Optimizer.
Your ONLY job is to fix spelling errors.
If the input looks like a typo, FIX IT. Do not just repeat it.
<|im_end|>
<|im_start|>user
Input: chep hotel
Output: cheap hotel

Input: airfort
Output: airport

Input: acomodation
Output: accommodation

Input: hutel
Output: hotel

Input: saggest me beaches
Output: suggest beaches

Input: ercommend me bech
Output: recommend beaches

Input: wer can i find chep fud
Output: where to find cheap food

Input: stay in virac near see
Output: accommodation in Virac near sea

Input: {user_input}
Output:<|im_end|>
<|im_start|>assistant"""
            
            output = self.llm(
                prompt, 
                max_tokens=32,
                stop=["<|im_end|>", "\n"],
                temperature=0.0,
                echo=False
            )
            
            rewritten = output['choices'][0]['text'].strip()
            
            if rewritten and len(rewritten) < len(user_input) * 3:
                print(f"[DEBUG] Rewriter: '{user_input}' → '{rewritten}'")
                return rewritten
            else:
                print(f"[WARN] Rewriter output suspicious, using original")
                return user_input
                
        except Exception as e:
            print(f"[WARN] Rewrite failed: {e}, using original")
            return user_input
