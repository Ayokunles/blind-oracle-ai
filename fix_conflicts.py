#!/usr/bin/env python3
import re

filepath = r'c:\Users\Lenovo\blind-oracle-ai\frontend\src\App.jsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Process line by line to handle conflicts  
output = []
i = 0
while i < len(lines):
    if lines[i].strip().startswith('<<<<<<< HEAD'):
        # Found a conflict marker - keep HEAD version
        i += 1
        head_lines = []
        # Collect HEAD content
        while i < len(lines) and not lines[i].strip().startswith('======='):
            head_lines.append(lines[i])
            i += 1
        # Skip the '=======' line
        if i < len(lines):
            i += 1
        # Skip the alternative content until we find the end marker
        while i < len(lines) and not lines[i].strip().startswith('>>>>>>> '):
            i += 1
        # Skip the end marker
        if i < len(lines):
            i += 1
        # Add the HEAD content
        output.extend(head_lines)
    else:
        output.append(lines[i])
        i += 1

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(output)
    
print('Fixed merge conflicts')
