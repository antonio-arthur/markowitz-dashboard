#!/usr/bin/env python
import os
import sys

def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'app.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError:
        raise ImportError("Django não instalado. Execute: pip install -r requirements.txt")
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()
    
