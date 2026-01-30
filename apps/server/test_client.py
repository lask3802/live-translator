import asyncio
import websockets
import numpy as np
import json
import logging

logging.basicConfig(level=logging.INFO)

async def test():
    uri = "ws://127.0.0.1:8001/ws/audio"
    print(f"Connecting to {uri}...")
    
    # Retry loop
    for i in range(5):
        try:
            async with websockets.connect(uri) as websocket:
                print("Connected.")
                # Send chunks of 512 samples.
                chunk_size = 512 # samples
                
                # Send silence
                print("Sending 2s of silence...")
                silence = np.zeros(chunk_size, dtype=np.int16).tobytes()
                for _ in range(30): # ~1s
                    await websocket.send(silence)
                    try:
                        msg = await asyncio.wait_for(websocket.recv(), 0.01)
                        print("Received:", msg)
                    except asyncio.TimeoutError:
                        pass
                    await asyncio.sleep(0.03)
                
                # Send signal
                print("Sending signal...")
                t = np.linspace(0, chunk_size/16000, chunk_size, endpoint=False)
                sine = (0.5 * 32767 * np.sin(2 * np.pi * 400 * t)).astype(np.int16)
                sine_bytes = sine.tobytes()
                
                for _ in range(30):
                    await websocket.send(sine_bytes)
                    try:
                        msg = await asyncio.wait_for(websocket.recv(), 0.01)
                        print("Received:", msg)
                    except asyncio.TimeoutError: 
                        pass
                    await asyncio.sleep(0.03)
                
                print("Finished.")
                return
        except Exception as e:
            print(f"Connection failed: {e}. Retrying in 1s...")
            await asyncio.sleep(1)

    print("Giving up.")

if __name__ == "__main__":
    asyncio.run(test())
