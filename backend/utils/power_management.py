import ctypes
import functools
import logging
import asyncio

logger = logging.getLogger("power_management")

# Windows implementation for preventing sleep
# https://docs.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-setthreadexecutionstate
ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001
ES_AWAYMODE_REQUIRED = 0x00000040

def prevent_sleep_task(func):
    """
    Decorator/Wrapper to prevent Windows from sleeping during a task.
    Supports both sync and async functions.
    """
    if asyncio.iscoroutinefunction(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            logger.info(f"Preventing sleep for async task: {func.__name__}")
            try:
                # SetThreadExecutionState returns the previous state
                # We request SYSTEM_REQUIRED to keep the computer awake
                ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED)
                return await func(*args, **kwargs)
            finally:
                logger.info(f"Allowing sleep after async task: {func.__name__}")
                # Reset to original state (continuous but not explicitly requiring system)
                ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)
        return async_wrapper
    else:
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            logger.info(f"Preventing sleep for sync task: {func.__name__}")
            try:
                ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED)
                return func(*args, **kwargs)
            finally:
                logger.info(f"Allowing sleep after sync task: {func.__name__}")
                ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)
        return sync_wrapper
