AutomatiQA Local Web Recording Agent (Linux x64)
================================================

QUICK START INSTRUCTIONS:
1. Make the binary executable and run:
   chmod +x automatiqa-agent-linux
   ./automatiqa-agent-linux
   
   Or run the shell script:
   bash start-agent.sh

2. Return to AutomatiQA Web Performance -> Record & Capture.
   You will see "Agent detected" with a green checkmark!

TROUBLESHOOTING & SYSTEM DEPENDENCIES:
If the browser fails to launch, run:
sudo apt install libnss3 libatk1.0-0 libgbm1 (Ubuntu/Debian)

A log file "automatiqa-agent.log" is recorded in this folder for diagnosis.
