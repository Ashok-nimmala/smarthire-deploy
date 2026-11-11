package com.bnp.paribas.features.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bnp.paribas.core.network.ApiException
import com.bnp.paribas.core.network.ErrorMapper
import com.bnp.paribas.core.utils.Validators
import com.bnp.paribas.data.local.Graph
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AuthUi(
    val busy: Boolean = false,
    val error: String? = null,
    val nameError: String? = null,
    val emailError: String? = null,
    val passwordError: String? = null,
    val confirmError: String? = null,
    val done: Boolean = false
)

class LoginViewModel : ViewModel() {
    private val _ui = MutableStateFlow(AuthUi())
    val ui: StateFlow<AuthUi> = _ui.asStateFlow()

    fun submit(email: String, password: String) {
        if (_ui.value.busy) return
        val e = email.trim()
        val emailErr = if (!Validators.email(e)) "Enter a valid email" else null
        val passErr = if (password.isEmpty()) "Enter your password" else null
        if (emailErr != null || passErr != null) {
            _ui.update { it.copy(emailError = emailErr, passwordError = passErr, error = null) }
            return
        }
        _ui.update { AuthUi(busy = true) }
        viewModelScope.launch {
            try {
                Graph.auth.login(e, password)
                _ui.update { it.copy(busy = false, done = true) }
            } catch (ex: ApiException) {
                _ui.update { it.copy(busy = false, error = message(ex)) }
            }
        }
    }

    private fun message(e: ApiException): String =
        if (e.status == 401) "Incorrect email or password." else ErrorMapper.userMessage(e)
}

class SignupViewModel : ViewModel() {
    private val _ui = MutableStateFlow(AuthUi())
    val ui: StateFlow<AuthUi> = _ui.asStateFlow()

    fun submit(name: String, email: String, password: String, confirm: String) {
        if (_ui.value.busy) return
        val n = name.trim()
        val e = email.trim()

        val nameErr = if (n.isEmpty() || n.length > 100) "Please enter your name" else null
        val emailErr = if (!Validators.email(e)) "Enter a valid email" else null
        val passErr = if (password.length < 8 || password.length > 128) "Password must contain at least 8 characters" else null
        val confirmErr = if (confirm != password) "Passwords do not match" else null

        if (nameErr != null || emailErr != null || passErr != null || confirmErr != null) {
            _ui.update {
                it.copy(nameError = nameErr, emailError = emailErr, passwordError = passErr, confirmError = confirmErr, error = null)
            }
            return
        }
        _ui.update { AuthUi(busy = true) }
        viewModelScope.launch {
            try {
                Graph.auth.signup(n, e, password)
                _ui.update { it.copy(busy = false, done = true) }
            } catch (ex: ApiException) {
                _ui.update { it.copy(busy = false, error = ErrorMapper.userMessage(ex)) }
            }
        }
    }
}
